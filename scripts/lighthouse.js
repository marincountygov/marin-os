#!/usr/bin/env node
// Runs Google Lighthouse accessibility testing through the PageSpeed Insights
// API (v5) against every app in catalog.json, plus MarinOS itself, and writes
// the results to data/lighthouse.json — the one source MarinOS's #accessibility
// page and every app's own #accessibility section read from.
//
//   node scripts/lighthouse.js                 scan everything
//   node scripts/lighthouse.js --app marin-docs   rescan one app, keep the rest
//   node scripts/lighthouse.js --dry-run       scan and print, write nothing
//
// No dependencies (global fetch, Node 18+). The API key is read from the
// PAGESPEED_API_KEY environment variable only — never printed, never written
// to the data file. Without a key the API still answers, with a much smaller
// quota, so a local run works but may hit rate limits.
//
// A failed request is never recorded as score 0: the entry becomes "error" or
// "unavailable" and keeps the previous good result under "lastSuccess".

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const catalogPath = path.join(repoRoot, "catalog.json");
const dataPath = path.join(repoRoot, "data", "lighthouse.json");

const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const SELF = { id: "marin-os", name: "MarinOS", url: "https://marincountygov.github.io/marin-os/" };
const MAX_ITEMS_PER_AUDIT = 5;
const RETRY_DELAYS_MS = [5000, 15000];
const REQUEST_TIMEOUT_MS = 120000;

function parseArgs(argv) {
  const args = { app: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--app") args.app = argv[++i];
    else if (argv[i].startsWith("--app=")) args.app = argv[i].slice(6);
    else throw new Error(`Unknown argument "${argv[i]}". Use --app <id> and/or --dry-run.`);
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Redacts the key from anything that might end up in a log or the data file.
function scrub(text) {
  const key = process.env.PAGESPEED_API_KEY;
  return key ? String(text).split(key).join("[redacted]") : String(text);
}

async function runPageSpeed(url) {
  const params = new URLSearchParams({ url, category: "accessibility", strategy: "mobile" });
  if (process.env.PAGESPEED_API_KEY) params.set("key", process.env.PAGESPEED_API_KEY);

  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.ok) return { ok: true, body: await response.json() };
      const retryable = response.status === 429 || response.status >= 500;
      let detail = "";
      try {
        detail = (await response.json()).error?.message || "";
      } catch {
        // Non-JSON error body — the status code alone will do.
      }
      lastError = { status: response.status, message: `PageSpeed API returned ${response.status}${detail ? `: ${detail}` : ""}` };
      if (!retryable) return { ok: false, ...lastError };
    } catch (error) {
      lastError = { status: 0, message: `Request failed: ${error.message}` };
    }
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }
  return { ok: false, ...lastError };
}

// Keeps only what's useful for fixing problems: audits that failed or need a
// manual check, with a few affected elements. Passing audits are left out so
// the file stays small.
function extractAudits(lighthouseResult) {
  const refs = lighthouseResult.categories?.accessibility?.auditRefs || [];
  const audits = [];
  for (const ref of refs) {
    const audit = lighthouseResult.audits?.[ref.id];
    if (!audit) continue;
    let status = null;
    if (audit.scoreDisplayMode === "manual") status = "manual";
    else if (audit.scoreDisplayMode === "binary" || audit.scoreDisplayMode === "numeric") {
      if (typeof audit.score === "number" && audit.score < 1) status = "failed";
    }
    if (!status) continue;
    const items = (audit.details?.items || [])
      .map((item) => item.node?.selector)
      .filter(Boolean)
      .slice(0, MAX_ITEMS_PER_AUDIT)
      .map((selector) => ({ selector }));
    audits.push({
      id: ref.id,
      title: audit.title,
      score: typeof audit.score === "number" ? audit.score : null,
      status,
      ...(items.length ? { items } : {}),
    });
  }
  return audits;
}

async function scan(app, previous) {
  const now = new Date().toISOString();
  const result = await runPageSpeed(app.url);
  const lastSuccess =
    previous && previous.status === "success"
      ? { score: previous.score, testedAt: previous.testedAt }
      : previous && previous.lastSuccess;
  const failure = (status, message) => ({
    status,
    url: app.url,
    attemptedAt: now,
    error: scrub(message),
    ...(lastSuccess ? { lastSuccess } : {}),
  });

  if (!result.ok) {
    // A 4xx other than rate-limiting means the API couldn't test the page
    // (bad or unreachable URL) — a different claim from "the service failed".
    const unavailable = result.status >= 400 && result.status < 500 && result.status !== 429;
    return failure(unavailable ? "unavailable" : "error", result.message);
  }

  const lighthouse = result.body.lighthouseResult;
  const raw = lighthouse?.categories?.accessibility?.score;
  if (lighthouse?.runtimeError || typeof raw !== "number") {
    const message = lighthouse?.runtimeError?.message || "Lighthouse returned no accessibility score.";
    return failure("unavailable", message);
  }

  return {
    status: "success",
    url: app.url,
    score: Math.round(raw * 100),
    testedAt: now,
    lighthouseVersion: lighthouse.lighthouseVersion,
    audits: extractAudits(lighthouse),
  };
}

function readExisting() {
  try {
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const apps = [SELF, ...catalog.map(({ id, name, url }) => ({ id, name, url }))];

  const targets = args.app ? apps.filter((app) => app.id === args.app) : apps;
  if (!targets.length) {
    console.error(`No app "${args.app}" in catalog.json. Known ids: ${apps.map((a) => a.id).join(", ")}.`);
    process.exit(1);
  }
  if (!process.env.PAGESPEED_API_KEY) {
    console.warn("PAGESPEED_API_KEY is not set — using the API's much smaller keyless quota.");
  }

  const existing = readExisting();
  const results = args.app && existing ? { ...existing.apps } : {};
  let succeeded = 0;

  for (const app of targets) {
    if (!app.url) {
      results[app.id] = { status: "not-tested" };
      console.log(`${app.id.padEnd(18)} not-tested (no URL)`);
      continue;
    }
    const entry = await scan(app, existing && existing.apps && existing.apps[app.id]);
    results[app.id] = entry;
    if (entry.status === "success") succeeded += 1;
    console.log(
      `${app.id.padEnd(18)} ${entry.status === "success" ? `${entry.score}/100` : `${entry.status}: ${entry.error}`}`
    );
  }

  const tested = targets.filter((app) => app.url).length;
  const output = {
    generatedAt: new Date().toISOString(),
    source: { name: "Google Lighthouse", service: "PageSpeed Insights API", category: "accessibility" },
    standard: "WCAG 2.2 AA",
    apps: results,
  };

  if (args.dryRun) {
    console.log("\nDry run — data/lighthouse.json not written.");
  } else {
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    fs.writeFileSync(dataPath, JSON.stringify(output, null, 2) + "\n");
    console.log("\nWrote data/lighthouse.json.");
  }

  console.log(`${succeeded} of ${tested} scan${tested === 1 ? "" : "s"} succeeded.`);
  // Some failures are normal (one app down); none succeeding means the scan
  // itself is broken (bad key, quota, network) and should fail loudly.
  if (tested > 0 && succeeded === 0) process.exit(1);
}

main().catch((error) => {
  console.error(scrub(error.message));
  process.exit(1);
});
