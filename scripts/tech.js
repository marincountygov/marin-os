#!/usr/bin/env node
// Collects technology facts for every app in catalog.json, plus MarinOS itself,
// and writes data/tech.json and data/sbom/<app-id>.spdx.json — the sources the
// MarinOS and per-app #tech sections read from.
//
//   node scripts/tech.js                       collect everything from GitHub
//   node scripts/tech.js --app marin-docs      refresh one app, keep the rest
//   node scripts/tech.js --dry-run             collect and print, write nothing
//   node scripts/tech.js --local-root ..       read marin.yml, vendor manifests
//                                              and notices from sibling checkouts
//                                              (GitHub is still used for the rest)
//
// No dependencies (global fetch, Node 18+). Public repositories need no token,
// but GITHUB_TOKEN (or GH_TOKEN) is used when present for the higher rate
// limit. It is only ever sent to api.github.com and never printed or written.
//
// What comes from where:
//   languages, license, last push   GitHub repository + Languages API
//   dependencies and the SBOM       GitHub dependency graph (SPDX, stored as-is)
//   bundled components              vendor/marinos/manifest.json and
//                                   THIRD_PARTY_NOTICES.md in the app's repo,
//                                   because vendored code is invisible to the
//                                   dependency graph
//   AI                              the `ai:` block in the app's marin.yml —
//                                   declared, never inferred
//
// A failed request is never recorded as zero or "none": the part becomes
// { "status": "unavailable" } and keeps the previous good result as lastSuccess.

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const catalogPath = path.join(repoRoot, "catalog.json");
const dataPath = path.join(repoRoot, "data", "tech.json");
const sbomDir = path.join(repoRoot, "data", "sbom");

const ORG = "marincountygov";
const API = "https://api.github.com";
const SELF = { id: "marin-os", name: "MarinOS", url: "https://marincountygov.github.io/marin-os/" };
const RETRY_DELAYS_MS = [3000, 10000];
const REQUEST_TIMEOUT_MS = 60000;

// ---------------------------------------------------------------------------
// Pure helpers (also used by check-tech.js)
// ---------------------------------------------------------------------------

// GitHub returns bytes per language. Percentages are rounded to one decimal.
function languagePercentages(bytesByLanguage) {
  const total = Object.values(bytesByLanguage).reduce((sum, n) => sum + n, 0);
  if (!total) return {};
  const out = {};
  for (const [name, bytes] of Object.entries(bytesByLanguage).sort((a, b) => b[1] - a[1])) {
    out[name] = Math.round((bytes / total) * 1000) / 10;
  }
  return out;
}

function purlEcosystem(pkg) {
  const ref = (pkg.externalRefs || []).find((r) => r.referenceType === "purl");
  const match = ref && /^pkg:([^/]+)\//.exec(ref.referenceLocator);
  return match ? match[1] : null;
}

// Summarizes an SPDX document. The root package is the repository itself (the
// element the document DESCRIBES), so it is not counted as a dependency.
// Direct = depended on by the root; everything else is transitive.
function summarizeSpdx(doc) {
  const packages = doc.packages || [];
  const relationships = doc.relationships || [];
  const rootIds = new Set(relationships.filter((r) => r.relationshipType === "DESCRIBES").map((r) => r.relatedSpdxElement));
  const directIds = new Set(
    relationships.filter((r) => r.relationshipType === "DEPENDS_ON" && rootIds.has(r.spdxElementId)).map((r) => r.relatedSpdxElement)
  );
  const deps = packages.filter((p) => !rootIds.has(p.SPDXID));
  const byEcosystem = {};
  const licenses = new Set();
  for (const pkg of deps) {
    const ecosystem = purlEcosystem(pkg) || "unknown";
    byEcosystem[ecosystem] = (byEcosystem[ecosystem] || 0) + 1;
    const license = pkg.licenseConcluded || pkg.licenseDeclared;
    if (license && license !== "NOASSERTION" && license !== "NONE") licenses.add(license);
  }
  const direct = deps.filter((p) => directIds.has(p.SPDXID)).length;
  return {
    total: deps.length,
    direct,
    transitive: deps.length - direct,
    byEcosystem,
    licenses: [...licenses].sort(),
  };
}

// Reads the small subset of YAML that marin.yml uses: nested mappings, scalars,
// and "- item" lists. Returns a plain object. Not a general YAML parser.
function parseMarinYml(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  const lines = text.split(/\r?\n/);
  const scalar = (raw) => {
    const value = raw.trim().replace(/\s+#.*$/, "");
    if (value === "true") return true;
    if (value === "false") return false;
    const quoted = /^"(.*)"$|^'(.*)'$/.exec(value);
    if (quoted) return quoted[1] ?? quoted[2];
    return value;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      if (Array.isArray(parent)) parent.push(scalar(trimmed.slice(2)));
      continue;
    }
    const m = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(trimmed);
    if (!m) continue;
    if (m[2] === undefined || m[2] === "") {
      // A key with no value opens a mapping, or a list if its next line is "- ".
      const next = lines.slice(i + 1).find((l) => l.trim() && !l.trim().startsWith("#"));
      const isList = next && next.trim().startsWith("- ");
      parent[m[1]] = isList ? [] : {};
      stack.push({ indent, node: parent[m[1]] });
    } else {
      parent[m[1]] = scalar(m[2]);
    }
  }
  return root;
}

// Turns the `ai:` block of a marin.yml into the tech.json shape. Missing means
// "not documented" and is never converted to used:false.
function readAi(marin) {
  const ai = marin && marin.ai;
  if (!ai || typeof ai !== "object" || typeof ai.used !== "boolean") return { status: "not-documented" };
  if (!ai.used) return { status: "documented", used: false };
  return {
    status: "documented",
    used: true,
    ...(ai.description ? { description: ai.description } : {}),
    ...(ai.provider ? { provider: ai.provider } : {}),
    ...(Array.isArray(ai.features) && ai.features.length ? { features: ai.features } : {}),
  };
}

// Turns the `services:` block of a marin.yml into the tech.json shape. These are
// the outside services the app itself uses (the App Shell's shared calls are
// described once, by the shell). `services: none` is a declaration that there
// are none; a missing block is "not documented", never "none".
const RUNS = ["browser", "build"];
function readServices(marin) {
  const services = marin && marin.services;
  if (services === "none") return { status: "documented", items: [] };
  if (!services || typeof services !== "object" || Array.isArray(services)) return { status: "not-documented" };
  const items = Object.entries(services).map(([id, s]) => ({
    id,
    name: s && s.name,
    purpose: s && s.purpose,
    runs: s && s.runs,
    visitorData: s && s["visitor-data"],
  }));
  return { status: "documented", items };
}

// THIRD_PARTY_NOTICES.md is free-form, so this reads the two shapes the repos
// use: "- Name 1.2.3[: url] — License" bullets, and "## Name" headings for
// components that have prose instead of a bullet. The shell and Pico CSS arrive
// with the shell, so the manifest covers them.
const SHELL_PROVIDED = /^(Marin App Shell|Pico CSS)$/i;
const NOT_COMPONENTS = /^(Marin App Shell|Existing application font assets|Third-party notices)$/i;

function parseNotices(text) {
  const items = [];
  const seen = new Map();
  const add = (item) => {
    const key = item.name.toLowerCase().replace(/s$/, "");
    if (SHELL_PROVIDED.test(item.name)) return;
    // A later mention fills in what an earlier one (such as a heading) lacked.
    if (seen.has(key)) return Object.assign(seen.get(key), { ...item, ...Object.fromEntries(Object.entries(seen.get(key)).filter(([, v]) => v)) });
    seen.set(key, item);
    items.push(item);
  };
  for (const line of text.split(/\r?\n/)) {
    const bullet = /^[-*]\s+(.+?)\s+[\u2014\u2013-]\s+(.+)$/.exec(line);
    if (bullet) {
      const license = bullet[2].replace(/\.$/, "");
      const label = bullet[1].replace(/:?\s*https?:\/\/\S+$/, "").replace(/:$/, "");
      const named = /^(.*?)\s+(\d+(?:\.\d+)+)$/.exec(label);
      add({ name: named ? named[1] : label, ...(named ? { version: named[2] } : {}), license });
      continue;
    }
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading && !NOT_COMPONENTS.test(heading[1].trim())) add({ name: heading[1].trim() });
  }
  return items;
}

function bundledComponents(manifest, notices) {
  const items = [];
  if (manifest && manifest.shellVersion) items.push({ name: "Marin App Shell", version: manifest.shellVersion, license: "MIT" });
  if (manifest && manifest.marinUiVersion) items.push({ name: "Marin UI", version: manifest.marinUiVersion, license: "MIT" });
  if (notices) items.push(...parseNotices(notices));
  return items;
}

// ---------------------------------------------------------------------------
// GitHub access
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const token = () => process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

function scrub(text) {
  const t = token();
  return t ? String(text).split(t).join("[redacted]") : String(text);
}

async function github(apiPath, accept = "application/vnd.github+json") {
  const headers = { Accept: accept, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "marinos-tech" };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  let last;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(`${API}${apiPath}`, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.ok) return { ok: true, status: response.status, response };
      const limited = response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
      last = { ok: false, status: response.status, message: `GitHub API returned ${response.status} for ${apiPath}${limited ? " (rate limited)" : ""}` };
      if (!(limited || response.status >= 500)) return last;
    } catch (error) {
      last = { ok: false, status: 0, message: `Request failed for ${apiPath}: ${error.message}` };
    }
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }
  return last;
}

async function githubJson(apiPath) {
  const result = await github(apiPath);
  return result.ok ? { ok: true, body: await result.response.json() } : result;
}

// A file from the repository's default branch, from a sibling checkout when
// --local-root is given, otherwise through the contents API.
async function repoFile(repo, filePath, localRoot) {
  if (localRoot) {
    try {
      return { ok: true, text: fs.readFileSync(path.join(localRoot, repo, filePath), "utf8") };
    } catch {
      return { ok: false, status: 404, message: `${repo}/${filePath} not found locally` };
    }
  }
  const result = await github(`/repos/${ORG}/${repo}/contents/${filePath}`, "application/vnd.github.raw+json");
  return result.ok ? { ok: true, text: await result.response.text() } : result;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

const unavailable = (message, previous) => ({
  status: "unavailable",
  error: scrub(message),
  attemptedAt: new Date().toISOString(),
  ...(previous && previous.status === "success" ? { lastSuccess: stripStatus(previous) } : previous && previous.lastSuccess ? { lastSuccess: previous.lastSuccess } : {}),
});
const stripStatus = ({ status, lastSuccess, ...rest }) => rest;

async function collect(app, previous, localRoot) {
  const prev = previous || {};
  const repo = app.id; // MarinOS app ids are repository names; check-tech.js verifies this against marin.yml.
  const entry = { repository: `${ORG}/${repo}`, url: `https://github.com/${ORG}/${repo}` };

  const meta = await githubJson(`/repos/${ORG}/${repo}`);
  if (meta.ok) {
    entry.license = meta.body.license && meta.body.license.spdx_id && meta.body.license.spdx_id !== "NOASSERTION" ? meta.body.license.spdx_id : null;
    entry.pushedAt = meta.body.pushed_at;
  } else {
    entry.metadata = unavailable(meta.message, prev.metadata);
  }

  const langs = await githubJson(`/repos/${ORG}/${repo}/languages`);
  if (langs.ok) {
    const pct = languagePercentages(langs.body);
    if (Object.keys(pct).length) {
      entry.languages = { status: "success", fetchedAt: new Date().toISOString(), percentages: pct, primary: Object.keys(pct)[0] };
    } else {
      entry.languages = { status: "none-detected" };
    }
  } else {
    entry.languages = unavailable(langs.message, prev.languages);
  }

  const sbom = await githubJson(`/repos/${ORG}/${repo}/dependency-graph/sbom`);
  if (sbom.ok && sbom.body.sbom && Array.isArray(sbom.body.sbom.packages)) {
    const doc = sbom.body.sbom;
    const summary = summarizeSpdx(doc);
    const created = doc.creationInfo && doc.creationInfo.created;
    entry.dependencies = {
      status: "success",
      ...summary,
      sbom: {
        format: "SPDX",
        version: String(doc.spdxVersion || "").replace(/^SPDX-/, ""),
        generated: created,
        source: "GitHub dependency graph",
        packages: doc.packages.length,
        path: `data/sbom/${app.id}.spdx.json`,
      },
    };
    entry.sbomDocument = doc; // stripped before writing tech.json
  } else {
    entry.dependencies = unavailable(sbom.ok ? "GitHub returned no SBOM." : sbom.message, prev.dependencies);
  }

  // Bundled components and AI are read from the repository's own files.
  const [manifest, notices, marinYml] = await Promise.all([
    repoFile(repo, "vendor/marinos/manifest.json", localRoot),
    repoFile(repo, "THIRD_PARTY_NOTICES.md", localRoot),
    repoFile(repo, "marin.yml", localRoot),
  ]);
  if (manifest.ok) {
    let parsed = null;
    try {
      parsed = JSON.parse(manifest.text);
    } catch {
      // Falls through to unavailable below.
    }
    entry.bundled = parsed
      ? { status: "success", components: bundledComponents(parsed, notices.ok ? notices.text : "") }
      : unavailable("vendor/marinos/manifest.json is not valid JSON.", prev.bundled);
  } else {
    entry.bundled = manifest.status === 404 ? { status: "none-detected" } : unavailable(manifest.message, prev.bundled);
  }

  if (marinYml.ok) {
    const marin = parseMarinYml(marinYml.text);
    entry.declaredRepo = marin.project && marin.project.repo;
    entry.ai = readAi(marin);
    entry.services = readServices(marin);
  } else {
    entry.ai = marinYml.status === 404 ? { status: "not-documented" } : unavailable(marinYml.message, prev.ai);
    entry.services = marinYml.status === 404 ? { status: "not-documented" } : unavailable(marinYml.message, prev.services);
  }
  return entry;
}

function readExisting() {
  try {
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = { app: null, dryRun: false, localRoot: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--app") args.app = argv[++i];
    else if (a.startsWith("--app=")) args.app = a.slice(6);
    else if (a === "--local-root") args.localRoot = path.resolve(argv[++i]);
    else if (a.startsWith("--local-root=")) args.localRoot = path.resolve(a.slice(13));
    else throw new Error(`Unknown argument "${a}". Use --app <id>, --local-root <dir> and/or --dry-run.`);
  }
  return args;
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
  if (!token()) console.warn("GITHUB_TOKEN is not set — using GitHub's smaller unauthenticated rate limit.");

  const existing = readExisting();
  const results = existing && existing.apps ? { ...existing.apps } : {};
  if (!args.app) for (const id of Object.keys(results)) if (!apps.some((a) => a.id === id)) delete results[id];
  let healthy = 0;

  if (!args.dryRun) fs.mkdirSync(sbomDir, { recursive: true });
  for (const app of targets) {
    const entry = await collect(app, results[app.id], args.localRoot);
    const doc = entry.sbomDocument;
    delete entry.sbomDocument;
    results[app.id] = entry;
    if (doc && !args.dryRun) fs.writeFileSync(path.join(sbomDir, `${app.id}.spdx.json`), JSON.stringify(doc, null, 2) + "\n");
    const parts = [entry.languages, entry.dependencies, entry.bundled, entry.ai, entry.services].map((p) => p.status);
    if (entry.languages.status === "success" && entry.dependencies.status === "success") healthy += 1;
    console.log(`${app.id.padEnd(18)} languages:${parts[0]} dependencies:${parts[1]} bundled:${parts[2]} ai:${parts[3]} services:${parts[4]}`);
  }

  const output = { generatedAt: new Date().toISOString(), source: { name: "GitHub", apis: ["repository", "languages", "dependency-graph/sbom"] }, apps: results };
  if (args.dryRun) {
    console.log("\nDry run — data/tech.json not written.");
  } else {
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    fs.writeFileSync(dataPath, JSON.stringify(output, null, 2) + "\n");
    console.log("\nWrote data/tech.json and data/sbom/.");
  }
  console.log(`${healthy} of ${targets.length} app${targets.length === 1 ? "" : "s"} collected languages and dependencies.`);
  // Some failures are normal; none succeeding means the run itself is broken.
  if (healthy === 0) process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(scrub(error.message));
    process.exit(1);
  });
}

module.exports = { RUNS, readServices, languagePercentages, summarizeSpdx, parseMarinYml, readAi, parseNotices, bundledComponents };
