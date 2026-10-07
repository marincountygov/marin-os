#!/usr/bin/env node
// Validates data/tech.json and data/sbom/*.spdx.json, and that every app in
// catalog.json, plus MarinOS itself, has an entry. No dependencies. A missing
// file passes with a note: the first run creates it (node scripts/tech.js, or
// the "Update tech data" workflow).

const fs = require("fs");
const path = require("path");
const { summarizeSpdx } = require("./tech");

const repoRoot = path.join(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "tech.json");
const PART_STATUSES = ["success", "none-detected", "unavailable"];
const SECRET = /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}/;

function main() {
  if (!fs.existsSync(dataPath)) {
    console.log("data/tech.json doesn't exist yet — run node scripts/tech.js to create it.");
    return;
  }
  const errors = [];
  const raw = fs.readFileSync(dataPath, "utf8");
  const data = JSON.parse(raw);
  if (SECRET.test(raw)) errors.push("data/tech.json appears to contain a credential.");
  if (!data.generatedAt || Number.isNaN(Date.parse(data.generatedAt))) errors.push('"generatedAt" must be a date-time.');
  if (!data.apps || typeof data.apps !== "object") errors.push('"apps" must be an object keyed by catalog id.');
  else {
    const ids = ["marin-os", ...JSON.parse(fs.readFileSync(path.join(repoRoot, "catalog.json"), "utf8")).map((a) => a.id)];
    for (const id of ids) {
      const e = data.apps[id];
      if (!e) {
        errors.push(`No entry for "${id}".`);
        continue;
      }
      if (e.repository !== `marincountygov/${id}`) errors.push(`"${id}" repository is "${e.repository}".`);
      if (e.declaredRepo && e.declaredRepo !== id) errors.push(`"${id}" marin.yml says project.repo is "${e.declaredRepo}", which doesn't match its id.`);

      for (const part of ["languages", "dependencies", "bundled", "ai"]) {
        const status = e[part] && e[part].status;
        const allowed = part === "ai" ? ["documented", "not-documented", "unavailable"] : PART_STATUSES;
        if (!allowed.includes(status)) errors.push(`"${id}" ${part} has status "${status}", not one of: ${allowed.join(", ")}.`);
        // A failure must never look like data.
        if (status === "unavailable" && Object.keys(e[part]).some((k) => ["total", "percentages", "used", "components"].includes(k))) {
          errors.push(`"${id}" ${part} is unavailable but carries data — keep old results under "lastSuccess".`);
        }
      }

      if (e.languages.status === "success") {
        const sum = Object.values(e.languages.percentages).reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 0.5) errors.push(`"${id}" language percentages total ${sum.toFixed(1)}, not ~100.`);
      }

      if (e.ai.status === "documented") {
        if (typeof e.ai.used !== "boolean") errors.push(`"${id}" ai.used must be true or false.`);
        if (e.ai.used === true && !e.ai.description) errors.push(`"${id}" uses AI but has no description.`);
      } else if ("used" in e.ai) errors.push(`"${id}" ai is "${e.ai.status}" but has "used" — missing must stay Not documented.`);

      if (e.dependencies.status === "success") {
        const d = e.dependencies;
        if (d.direct + d.transitive !== d.total) errors.push(`"${id}" direct + transitive doesn't equal total.`);
        const file = path.join(repoRoot, d.sbom.path);
        if (!fs.existsSync(file)) errors.push(`"${id}" SBOM ${d.sbom.path} is missing.`);
        else {
          let doc;
          try {
            doc = JSON.parse(fs.readFileSync(file, "utf8"));
          } catch {
            errors.push(`${d.sbom.path} isn't valid JSON.`);
          }
          if (doc) {
            if (!/^SPDX-\d+\.\d+$/.test(doc.spdxVersion || "") || doc.SPDXID !== "SPDXRef-DOCUMENT") errors.push(`${d.sbom.path} isn't valid SPDX metadata.`);
            const spdxIds = new Set((doc.packages || []).map((p) => p.SPDXID));
            spdxIds.add("SPDXRef-DOCUMENT");
            for (const r of doc.relationships || []) {
              if (!spdxIds.has(r.spdxElementId) || !spdxIds.has(r.relatedSpdxElement)) errors.push(`${d.sbom.path} has a relationship to an unknown package.`);
            }
            if (SECRET.test(JSON.stringify(doc))) errors.push(`${d.sbom.path} appears to contain a credential.`);
            const s = summarizeSpdx(doc);
            if (s.total !== d.total || s.direct !== d.direct) errors.push(`"${id}" dependency counts don't match ${d.sbom.path}.`);
          }
        }
      }
    }
    for (const id of Object.keys(data.apps)) if (!ids.includes(id)) errors.push(`"${id}" isn't in catalog.json.`);
  }

  if (errors.length) {
    console.error("data/tech.json has problems:\n");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`data/tech.json is valid (${Object.keys(data.apps).length} apps).`);
}

main();
