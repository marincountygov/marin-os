#!/usr/bin/env node
// Validates data/lighthouse.json (see schemas/lighthouse.schema.json) and that
// every app in catalog.json, plus MarinOS itself, has an entry. No
// dependencies. A missing file passes with a note: the first scan creates it
// (node scripts/lighthouse.js, or the "Lighthouse accessibility" workflow).

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "lighthouse.json");
const STATUSES = ["success", "not-tested", "unavailable", "error"];

function main() {
  if (!fs.existsSync(dataPath)) {
    console.log("data/lighthouse.json doesn't exist yet — run a scan to create it.");
    return;
  }
  const errors = [];
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  if (!data.generatedAt || Number.isNaN(Date.parse(data.generatedAt))) errors.push('"generatedAt" must be a date-time.');
  if (data.standard !== "WCAG 2.2 AA") errors.push('"standard" must be "WCAG 2.2 AA".');
  if (!data.source || data.source.category !== "accessibility" || data.source.service !== "PageSpeed Insights API") {
    errors.push('"source" must name Google Lighthouse / PageSpeed Insights API / accessibility.');
  }
  if (!data.apps || typeof data.apps !== "object") {
    errors.push('"apps" must be an object keyed by catalog id.');
  } else {
    const ids = ["marin-os", ...JSON.parse(fs.readFileSync(path.join(repoRoot, "catalog.json"), "utf8")).map((a) => a.id)];
    for (const id of ids) {
      const entry = data.apps[id];
      if (!entry) {
        errors.push(`No entry for "${id}".`);
        continue;
      }
      if (!STATUSES.includes(entry.status)) errors.push(`"${id}" has status "${entry.status}", not one of: ${STATUSES.join(", ")}.`);
      if (entry.status === "success") {
        if (!Number.isInteger(entry.score) || entry.score < 0 || entry.score > 100) errors.push(`"${id}" success needs an integer score 0-100.`);
        if (!entry.testedAt) errors.push(`"${id}" success needs "testedAt".`);
      } else if ("score" in entry) {
        // The one rule that matters most: a failure must never look like a low score.
        errors.push(`"${id}" is "${entry.status}" but has a "score" — failures keep the old score under "lastSuccess".`);
      }
    }
    for (const id of Object.keys(data.apps)) {
      if (!ids.includes(id)) errors.push(`"${id}" isn't in catalog.json.`);
    }
  }

  if (errors.length > 0) {
    console.error("data/lighthouse.json has problems:\n");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`data/lighthouse.json is valid (${Object.keys(data.apps).length} apps).`);
}

main();
