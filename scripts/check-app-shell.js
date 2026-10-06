#!/usr/bin/env node
"use strict";
// Read-only, dependency-free checks for this app's App Shell integration.
// Run from any directory: node scripts/check-app-shell.js [path-to-marin-os]
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function attributes(tag) {
  const result = {};
  const content = tag.replace(/^<\/?[\w-]+\b/, "").replace(/\/?\s*>$/, "");
  const pattern = /([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(content))) {
    const key = match[1].toLowerCase();
    requireCondition(!Object.hasOwn(result, key), `Duplicate HTML attribute ${key}`);
    result[key] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}
function scalar(block, key, source) {
  // Deliberately limited to the ordinary two-space block mappings in marin.yml.
  const starts = [...source.matchAll(new RegExp(`^${block}:\\s*(?:#.*)?$`, "gm"))];
  requireCondition(starts.length === 1, `Expected one ${block}: block in marin.yml`);
  const tail = source.slice(starts[0].index + starts[0][0].length);
  const lines = [];
  for (const line of tail.split(/\r?\n/)) {
    if (line.trim() && !line.trimStart().startsWith("#") && !/^\s/.test(line)) break;
    lines.push(line);
  }
  const values = [...lines.join("\n").matchAll(new RegExp(`^  ${key}:\\s*(?:"([^"\\n]*)"|'([^'\\n]*)'|([^#\\n]*?))\\s*(?:#.*)?$`, "gm"))];
  requireCondition(values.length === 1, `Expected exactly one ${block}.${key} scalar`);
  return (values[0][1] ?? values[0][2] ?? values[0][3]).trim();
}
function checkedFile(base, relative, meta) {
  requireCondition(relative && !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes(".."), `Unsafe managed path: ${relative}`);
  const target = path.resolve(base, relative);
  requireCondition(target.startsWith(path.resolve(base) + path.sep), `Managed path escapes its root: ${relative}`);
  let cursor = target;
  while (cursor !== path.resolve(base)) {
    requireCondition(!fs.lstatSync(cursor).isSymbolicLink(), `Managed path is a symlink: ${relative}`);
    cursor = path.dirname(cursor);
  }
  const bytes = fs.readFileSync(target);
  requireCondition(bytes.length === meta.bytes, `Incorrect size: ${relative}`);
  requireCondition(crypto.createHash("sha256").update(bytes).digest("hex") === meta.sha256, `Hash mismatch: ${relative}`);
}
function filesBelow(base, prefix = "") {
  return fs.readdirSync(path.join(base, prefix), { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    requireCondition(!entry.isSymbolicLink(), `Unexpected symlink: ${relative}`);
    return entry.isDirectory() ? filesBelow(base, relative) : [relative];
  }).sort();
}

function main() {
  const yaml = read("marin.yml");
  const version = scalar("platform", "shell", yaml);
  const status = scalar("project", "status", yaml);
  requireCondition(/^1\.(?:[5-9]|[1-9]\d+)\.\d+$/.test(version), "MarinOS requires App Shell 1.5.0 or a compatible later 1.x release");
  requireCondition(!/^  marin-ui:/m.test(yaml), "Remove the direct Marin UI dependency from marin.yml");
  requireCondition(["alpha", "beta", "live"].includes(status), "project.status must be alpha, beta, or live");
  requireCondition(scalar("project", "repo", yaml) === "marin-os", "Unexpected project.repo");
  requireCondition(scalar("project", "type", yaml) === "platform", "Preserve project.type: platform");

  const manifest = JSON.parse(read("vendor/marinos/manifest.json"));
  requireCondition(manifest.shellVersion === version, "platform.shell and installed shellVersion differ");
  requireCondition(manifest.installPath === "vendor/marinos", "Unexpected shell installPath");
  for (const key of ["files", "fontAssets", "companionIcons"]) {
    requireCondition(manifest[key] && Object.keys(manifest[key]).length, `Missing manifest ${key}`);
  }
  const dist = path.join(root, "vendor/marinos");
  for (const [relative, meta] of Object.entries(manifest.files)) checkedFile(dist, relative, meta);
  const expected = [...Object.keys(manifest.files), "manifest.json"].sort();
  requireCondition(JSON.stringify(filesBelow(dist)) === JSON.stringify(expected), "Unexpected/missing files in vendor/marinos");
  for (const [relative, meta] of Object.entries(manifest.fontAssets)) checkedFile(root, relative, meta);
  for (const [relative, meta] of Object.entries(manifest.companionIcons)) checkedFile(root, relative, meta);

  const html = read("index.html");
  const appJs = read("assets/app.js");
  const css = read("assets/app.css");
  const source = html.replace(/<!--[\s\S]*?-->/g, "");
  function host(name) {
    const matches = [...source.matchAll(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, "g"))];
    requireCondition(matches.length === 1, `Expected one <${name}> component`);
    return { markup: matches[0][0], attrs: attributes(matches[0][0].match(/^<[^>]+>/)[0]) };
  }
  const banner = host("marin-os-banner");
  requireCondition(banner.attrs.label === status, "Banner label must match project.status");
  requireCondition(banner.attrs["catalog-url"] === "catalog.json" && banner.attrs["browse-url"] === "./", "MarinOS banner must use its local catalog and home URL");
  const header = host("marin-app-header");
  requireCondition(header.attrs["app-id"] === "marin-os" && header.attrs["app-name"] === "MarinOS", "Header identity mismatch");
  requireCondition(header.attrs["standard-links"] === "about updates", "Header must contain only About and Updates, not Security");
  requireCondition(!/data-navigation/.test(header.markup), "Do not add extra header navigation; Security belongs in the footer");
  const icon = read("vendor/icons/lucide/layout-grid.svg").trim();
  requireCondition(header.markup.includes(icon), "Header must use the supplied canonical layout-grid SVG");
  const geometry = icon.match(/^<svg\b[^>]*>([\s\S]*)<\/svg>$/)[1];
  const favicon = read("assets/icon.svg");
  requireCondition(favicon.includes(geometry) && /stroke-width="2"/.test(favicon), "Favicon must retain the header's Lucide geometry/stroke");

  const info = host("marin-app-info");
  requireCondition(info.attrs.sections === "updates" && info.attrs.repo === "marin-os", "Only Updates is generated: preserve the platform's About/Security/Accessibility inventories");
  const footer = host("marin-app-footer");
  requireCondition(footer.attrs["app-name"] === "MarinOS" && Object.hasOwn(footer.attrs, "hide-platform-link"), "MarinOS footer must hide the bottom platform link");
  requireCondition(!Object.hasOwn(footer.attrs, "links"), "Keep the four required standard footer links in their default order");
  const templates = [...footer.markup.matchAll(/<template\b[^>]*data-footer-links[^>]*>([\s\S]*?)<\/template>/g)];
  requireCondition(templates.length === 1, "Expected one footer links template");
  const anchors = [...templates[0][1].matchAll(/<a\b([^>]*)>([^<]+)<\/a>/g)];
  requireCondition(anchors.length === 2, "Expected only Projects and Status in the footer template");
  for (const [index, name] of ["Projects", "Status"].entries()) {
    requireCondition(attributes(`<a ${anchors[index][1]}>`).href === `#${name.toLowerCase()}` && anchors[index][2].trim() === name, "Footer additions must be Projects, then Status");
  }
  host("marin-app-feedback");
  requireCondition(!/<(?:header|footer)\b/.test(source), "Do not copy rendered header/footer markup into the app");
  requireCondition(!/id="(?:app-nav|menu-toggle|app-status-message|updates)"/.test(source), "Duplicate shell-owned infrastructure in source HTML");
  const ids = [...source.matchAll(/<[a-z][^>]*>/gi)].map((m) => attributes(m[0]).id).filter(Boolean);
  requireCondition(new Set(ids).size === ids.length, "Duplicate source element IDs");
  const sections = [...source.matchAll(/<section\b[^>]*>/g)].map((m) => attributes(m[0]));
  requireCondition(sections.slice(0, 2).every((s) => s["data-tab-section"] === "directory" && !Object.hasOwn(s, "hidden")), "Both static directory sections must be the visible default group");
  for (const id of ["about", "projects", "security", "status", "accessibility"]) {
    requireCondition(sections.filter((s) => s.id === id && s["data-tab-section"] === id && Object.hasOwn(s, "hidden")).length === 1, `Missing/duplicate app-owned #${id} section`);
  }
  requireCondition(/data-accessibility-table/.test(source) && /data-accessibility-body/.test(source), "Preserve the platform-wide accessibility inventory");
  requireCondition(!/data-accessibility-scores/.test(source), "Do not add a second, single-app accessibility renderer");
  requireCondition(/<noscript>/.test(source), "Provide a no-JavaScript explanation alongside the static directory");
  requireCondition(!/MARINOS_OWN_STATUS|data-marinos-own-status/.test(source + appJs), "Remove the old hard-coded self-status mechanism");

  const links = [...source.matchAll(/<link\b[^>]*>/g)].map((m) => attributes(m[0]));
  const styles = links.filter((a) => a.rel === "stylesheet").map((a) => a.href);
  requireCondition(JSON.stringify(styles) === JSON.stringify(["vendor/marinos/marinos.css", "assets/app.css"]), "Load only shell CSS then app CSS");
  const scripts = [...source.matchAll(/<script\b[^>]*>/g)].map((m) => attributes(m[0]));
  requireCondition(scripts.length === 2 && scripts[0].src === "vendor/marinos/marinos.js" && scripts[1].src === "assets/app.js" && scripts.every((s) => Object.hasOwn(s, "defer")), "Load the deferred shell before the deferred application script");
  requireCondition(!/<style\b/.test(source), "Keep app styles in assets/app.css");
  requireCondition(!/@font-face|@import|font-family\s*:/.test(css), "Do not duplicate font loading/tokens in app CSS");
  for (const old of ["shared/app-brand.css", "shared/app-shell.js", "vendor/pico.min.css", "BRAND_VERSION"]) {
    requireCondition(!fs.existsSync(path.join(root, old)), `Remove obsolete file ${old}`);
    requireCondition(!(source + appJs + css).includes(old), `Obsolete runtime reference: ${old}`);
  }
  for (const item of [...links.map((a) => a.href), ...scripts.map((a) => a.src)]) {
    requireCondition(item && !/^(?:https?:|\/\/)/i.test(item), `External static resource: ${item}`);
    requireCondition(fs.existsSync(path.join(root, item)), `Missing local asset ${item}`);
  }
  console.log(`App Shell ${version}: integration, managed assets, header/footer, identity, status, and local resources pass.`);
}
try { main(); } catch (error) { console.error(`App Shell check failed: ${error.message}`); process.exitCode = 1; }
