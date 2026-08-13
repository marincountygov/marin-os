#!/usr/bin/env node
// Confirms catalog.json and the directory cards in index.html agree.
// No dependencies — this repo has no build step and this check shouldn't add one.
//
// Checks, per catalog.json entry: a directory card in index.html exists whose
// link href matches the entry's url, whose link text matches its name, and
// whose <p> text matches its description. Also flags any directory card in
// index.html with no matching catalog.json entry, so the two can't drift in
// either direction.

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const catalogPath = path.join(repoRoot, "catalog.json");
const indexPath = path.join(repoRoot, "index.html");

function readCatalog() {
  const raw = fs.readFileSync(catalogPath, "utf8");
  const entries = JSON.parse(raw);
  for (const entry of entries) {
    for (const field of ["id", "name", "url", "description"]) {
      if (!entry[field]) {
        throw new Error(`catalog.json entry ${entry.id || "(no id)"} is missing required field "${field}"`);
      }
    }
  }
  return entries;
}

function readCards() {
  const html = fs.readFileSync(indexPath, "utf8");
  const cardPattern = /<article class="app-card directory-card">([\s\S]*?)<\/article>/g;
  const linkPattern = /<h3><a href="([^"]+)">([^<]+)<\/a><\/h3>/;
  const descriptionPattern = /<p>([^<]+)<\/p>/;

  const cards = [];
  let match;
  while ((match = cardPattern.exec(html)) !== null) {
    const cardHtml = match[1];
    const linkMatch = linkPattern.exec(cardHtml);
    const descriptionMatch = descriptionPattern.exec(cardHtml);
    if (!linkMatch) {
      throw new Error(`Found a directory card in index.html with no parseable <h3><a> link:\n${match[0]}`);
    }
    cards.push({
      url: linkMatch[1],
      name: linkMatch[2],
      description: descriptionMatch ? descriptionMatch[1] : "",
    });
  }
  return cards;
}

function main() {
  const entries = readCatalog();
  const cards = readCards();
  const errors = [];

  for (const entry of entries) {
    const card = cards.find((c) => c.url === entry.url);
    if (!card) {
      errors.push(`catalog.json has "${entry.name}" (${entry.url}) but index.html has no matching directory card.`);
      continue;
    }
    if (card.name !== entry.name) {
      errors.push(`"${entry.url}": catalog.json name is "${entry.name}" but index.html link text is "${card.name}".`);
    }
    if (card.description !== entry.description) {
      errors.push(
        `"${entry.url}": catalog.json description is "${entry.description}" but index.html card text is "${card.description}".`
      );
    }
  }

  for (const card of cards) {
    const entry = entries.find((e) => e.url === card.url);
    if (!entry) {
      errors.push(`index.html has a directory card for "${card.name}" (${card.url}) with no matching catalog.json entry.`);
    }
  }

  if (errors.length > 0) {
    console.error("catalog.json and index.html are out of sync:\n");
    for (const error of errors) console.error(`  - ${error}`);
    console.error("\nUpdate both files together — see README.md's \"Directory entries\" section.");
    process.exit(1);
  }

  console.log(`catalog.json and index.html agree on all ${entries.length} entries.`);
}

main();
