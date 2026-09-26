#!/usr/bin/env node
// Repository-level security checks (Phase 15, manual-run for v1 per
// security/README.md's Decision 5 — no CI wiring yet). No dependencies,
// same convention as this directory's other scripts.
//
// Checks: security.json exists and validates; SECURITY.md exists; README has
// a "# Security" or "## Security" section (either heading level, since not
// every repo's README uses the same one); index.html has a #security tab
// section and an About → Security link; .well-known/security.txt exists (only when
// security.json's securityTxt.enabled is true — a repo that hasn't turned it
// on yet isn't "missing" it).
//
// Usage: node scripts/check-security.js [path-to-app-repo]
//        (defaults to this repo itself, same default as the other scripts)

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function main() {
  const repoRoot = path.resolve(process.argv[2] || path.join(__dirname, ".."));
  const errors = [];
  const warnings = [];

  const securityJsonPath = path.join(repoRoot, "security.json");
  if (!fs.existsSync(securityJsonPath)) {
    errors.push("security.json is missing.");
  } else {
    try {
      execFileSync("node", [path.join(__dirname, "validate-security.js"), securityJsonPath], { stdio: "pipe" });
    } catch (error) {
      errors.push(`security.json does not validate against the schema:\n${error.stdout}`);
    }
  }

  if (!fs.existsSync(path.join(repoRoot, "SECURITY.md"))) {
    errors.push("SECURITY.md is missing.");
  }

  const readmePath = path.join(repoRoot, "README.md");
  if (!fs.existsSync(readmePath)) {
    errors.push("README.md is missing.");
  } else if (!/^#{1,2}\s+Security\s*$/m.test(fs.readFileSync(readmePath, "utf8"))) {
    // Some repos use a flat # H1-per-section README (marin-magic) instead of
    // a single # title + ## subsections (marin-os) — accept either level
    // rather than forcing a heading convention this repo doesn't use.
    errors.push('README.md has no "# Security" or "## Security" section.');
  }

  const indexPath = path.join(repoRoot, "index.html");
  if (!fs.existsSync(indexPath)) {
    warnings.push("index.html not found — skipping #security / About-link checks (not every repo in scope is a rendered app).");
  } else {
    const html = fs.readFileSync(indexPath, "utf8");
    // Most apps mark a tab section with data-tab-section (marin-ui's shared
    // generic tab mechanism); at least one (marin-magic) has its own custom
    // hash-routing script instead and marks sections by id alone. Accept
    // either — what matters is that a #security section exists at all.
    if (!/data-tab-section="security"/.test(html) && !/<section id="security"/.test(html)) {
      errors.push('index.html has no #security section (neither data-tab-section="security" nor id="security" found).');
    }
    if (!/<a href="#security">/.test(html)) {
      errors.push('index.html\'s nav has no <a href="#security"> link.');
    }
    const aboutMatch = html.match(/<section id="about"[^>]*>([\s\S]*?)<\/section>/);
    if (aboutMatch && !/#security/.test(aboutMatch[1])) {
      errors.push('The #about section exists but does not link to #security (Phase 11).');
    }
  }

  if (fs.existsSync(securityJsonPath)) {
    const config = JSON.parse(fs.readFileSync(securityJsonPath, "utf8"));
    if (config.securityTxt && config.securityTxt.enabled) {
      const securityTxtPath = path.join(repoRoot, ".well-known", "security.txt");
      if (!fs.existsSync(securityTxtPath)) {
        errors.push(".well-known/security.txt is missing, but security.json's securityTxt.enabled is true.");
      }
    }
  }

  for (const warning of warnings) console.warn(`WARNING: ${warning}`);

  if (errors.length === 0) {
    console.log(`${repoRoot}: all security checks passed.`);
  } else {
    console.error(`${repoRoot}: ${errors.length} security check(s) failed:\n`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
}

main();
