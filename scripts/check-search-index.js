#!/usr/bin/env node
// Checks data/search-index.json, the list marin-data builds for the search box on the home page: it has a base address,
// every entry has a kind, a name and a place to open, and no entry opens nothing. (marin-data checks the list is current.)
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "data", "search-index.json");
const doc = JSON.parse(fs.readFileSync(file, "utf8"));
const problems = [];
if (!/^https:\/\//.test(doc.base || "")) problems.push("base must be a whole address");
if (!Array.isArray(doc.entries) || !doc.entries.length) problems.push("entries must be a list that is not empty");
const KINDS = new Set(["Organization", "Program", "Place", "Service", "Person"]);
(doc.entries || []).forEach((e, i) => {
  const where = `entry ${i} (${e.n || "no name"})`;
  if (!KINDS.has(e.k)) problems.push(`${where}: kind ${e.k} is not one of ${[...KINDS].join(", ")}`);
  if (!e.n || !e.n.trim()) problems.push(`${where}: needs a name`);
  if (!e.h) problems.push(`${where}: needs a page to open`);
  if (e.a && !Array.isArray(e.a)) problems.push(`${where}: other names must be a list`);
});
if (problems.length) {
  console.error(`data/search-index.json has problems:\n\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`data/search-index.json is valid (${doc.entries.length} entries).`);
