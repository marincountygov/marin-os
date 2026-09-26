#!/usr/bin/env node
// Generates .well-known/security.txt from an app's security.json, per
// RFC 9116. No dependencies, same convention as validate-security.js and
// marin-ui/scripts/sync-consumer.sh.
//
// Usage: node scripts/generate-security-txt.js [path-to-app-repo]
//        (defaults to this repo itself, same default as validate-security.js)
//
// Refuses to generate an already-expired file — an expired security.txt is
// worse than a missing one (RFC 9116 says clients should distrust it), so
// this is a hard error, not a warning.

const fs = require("fs");
const path = require("path");

function main() {
  const repoRoot = path.resolve(process.argv[2] || path.join(__dirname, ".."));
  const securityJsonPath = path.join(repoRoot, "security.json");

  if (!fs.existsSync(securityJsonPath)) {
    console.error(`No security.json found at ${securityJsonPath}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(securityJsonPath, "utf8"));
  const securityTxt = config.securityTxt;

  if (!securityTxt || !securityTxt.enabled) {
    console.error(`security.json at ${securityJsonPath} has no securityTxt.enabled — nothing to generate.`);
    process.exit(1);
  }
  if (!Array.isArray(securityTxt.contact) || securityTxt.contact.length === 0) {
    console.error("securityTxt.contact must have at least one entry (RFC 9116 requires it).");
    process.exit(1);
  }
  if (!securityTxt.expires) {
    console.error("securityTxt.expires is required by RFC 9116.");
    process.exit(1);
  }

  const expiresDate = new Date(securityTxt.expires);
  if (Number.isNaN(expiresDate.getTime())) {
    console.error(`securityTxt.expires "${securityTxt.expires}" is not a valid date.`);
    process.exit(1);
  }
  if (expiresDate.getTime() <= Date.now()) {
    console.error(
      `securityTxt.expires (${securityTxt.expires}) is in the past. Refusing to generate an expired security.txt — ` +
        `update security.json's expiration date first (RFC 9116 says clients should distrust an expired file).`
    );
    process.exit(1);
  }

  const lines = [
    "# This file is generated from security.json — do not edit it directly.",
    `# Regenerate with: node scripts/generate-security-txt.js`,
    "",
  ];
  for (const contact of securityTxt.contact) lines.push(`Contact: ${contact}`);
  if (securityTxt.policy) lines.push(`Policy: ${securityTxt.policy}`);
  if (securityTxt.canonicalUrl) lines.push(`Canonical: ${securityTxt.canonicalUrl}`);
  if (Array.isArray(securityTxt.preferredLanguages) && securityTxt.preferredLanguages.length) {
    lines.push(`Preferred-Languages: ${securityTxt.preferredLanguages.join(", ")}`);
  }
  lines.push(`Expires: ${expiresDate.toISOString()}`);

  const outDir = path.join(repoRoot, ".well-known");
  const outPath = path.join(outDir, "security.txt");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(`Wrote ${outPath}`);
}

main();
