#!/usr/bin/env node
// Confirms catalog.json and the directory cards in index.html agree.
// No dependencies — this repo has no build step and this check shouldn't add one.
//
// Checks, per catalog.json entry: a directory card in index.html exists whose
// link href matches the entry's url, whose link text matches its name, whose
// <p> text matches its description, and whose status badge matches its
// status. Also flags any directory card in index.html with no matching
// catalog.json entry, so the two can't drift in either direction.
//
// The home page has two lists of cards: the Apps section (#home-apps) shows
// only the featured apps, in featured-number order, and the All apps page
// (#apps) shows every app. An entry with "unlisted": true is hidden from both
// (and from the banner menu, search and the inventories) and has no card. No
// card carries a Featured badge: the Apps section is what features an app.

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const catalogPath = path.join(repoRoot, "catalog.json");
const indexPath = path.join(repoRoot, "index.html");

// MarinOS app-maturity status — see index.html's #status section for what
// each one means. "active"/"prototype" (this file's own values until
// 2026-10-02, and still what some apps' marin.yml says) are deliberately not
// in this list: this enum, not a status.json file, so every entry must use
// exactly one of these, and a value from the earlier, undocumented
// free-for-all should fail loudly rather than pass through.
const VALID_STATUSES = ["alpha", "beta", "live"];

function readCatalog() {
  const raw = fs.readFileSync(catalogPath, "utf8");
  const entries = JSON.parse(raw);
  for (const entry of entries) {
    for (const field of ["id", "name", "url", "description", "status"]) {
      if (!entry[field]) {
        throw new Error(`catalog.json entry ${entry.id || "(no id)"} is missing required field "${field}"`);
      }
    }
    if (entry.unlisted !== undefined && entry.unlisted !== true) {
      throw new Error(`catalog.json entry "${entry.id}" has an unlisted value that isn't true. Leave the field out for a listed app.`);
    }
    if (entry.unlisted && entry.featured !== undefined) {
      throw new Error(`catalog.json entry "${entry.id}" is unlisted and featured. An unlisted app cannot be featured.`);
    }
    if (entry.featured !== undefined && !(Number.isInteger(entry.featured) && entry.featured > 0)) {
      throw new Error(`catalog.json entry "${entry.id}" has a featured value that isn't a whole number from 1 up.`);
    }
    if (!VALID_STATUSES.includes(entry.status)) {
      throw new Error(
        `catalog.json entry "${entry.id}" has status "${entry.status}", which isn't one of: ${VALID_STATUSES.join(", ")}.`
      );
    }
  }
  return entries;
}

function readCards(html, where) {
  const cardPattern = /<article class="app-card directory-card">([\s\S]*?)<\/article>/g;
  const linkPattern = /<h3><a href="([^"]+)">([^<]+)<\/a><\/h3>/;
  const statusPattern = /<span class="app-status" data-status="([^"]+)">[^<]*<\/span>/;
  const descriptionPattern = /<p>([^<]+)<\/p>/;

  const cards = [];
  let match;
  while ((match = cardPattern.exec(html)) !== null) {
    const cardHtml = match[1];
    const linkMatch = linkPattern.exec(cardHtml);
    const statusMatch = statusPattern.exec(cardHtml);
    const descriptionMatch = descriptionPattern.exec(cardHtml);
    if (!linkMatch) {
      throw new Error(`Found a directory card in ${where} with no parseable <h3><a> link:\n${match[0]}`);
    }
    cards.push({
      url: linkMatch[1],
      name: linkMatch[2],
      status: statusMatch ? statusMatch[1] : null,
      badge: cardHtml.includes('class="app-badge"'),
      description: descriptionMatch ? descriptionMatch[1] : "",
    });
  }
  return cards;
}

// The Apps section on the home page and the All apps page, each as the text of its own list of cards.
function readLists() {
  const html = fs.readFileSync(indexPath, "utf8");
  const featuredStart = html.indexOf('id="home-apps"');
  const allStart = html.indexOf('<section id="apps"');
  if (featuredStart < 0 || allStart < 0 || allStart < featuredStart) {
    throw new Error('index.html needs the Apps section (id="home-apps") followed by the All apps page (<section id="apps">).');
  }
  const allEnd = html.indexOf("</section>", allStart);
  return {
    featured: readCards(html.slice(featuredStart, allStart), 'the Apps section (#home-apps)'),
    all: readCards(html.slice(allStart, allEnd), "the All apps page (#apps)"),
  };
}

function main() {
  const entries = readCatalog();
  const { featured: featuredCards, all: cards } = readLists();
  const errors = [];
  const listed = entries.filter((e) => !e.unlisted);

  for (const entry of listed) {
    const card = cards.find((c) => c.url === entry.url);
    if (!card) {
      errors.push(`catalog.json has "${entry.name}" (${entry.url}) but the All apps page has no matching directory card.`);
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
    if (card.status !== entry.status) {
      errors.push(
        `"${entry.url}": catalog.json status is "${entry.status}" but index.html card status badge is "${card.status || "(missing)"}".`
      );
    }
  }

  for (const card of [...featuredCards, ...cards]) {
    if (card.badge) errors.push(`"${card.url}": the card has a badge besides its status. Cards show the status only; the Apps section is what features an app.`);
  }

  const rank = { live: 0, beta: 1, alpha: 2 };
  const expected = [...listed]
    .sort((a, b) => (a.featured ?? Infinity) - (b.featured ?? Infinity) || rank[a.status] - rank[b.status] || a.name.localeCompare(b.name))
    .map((e) => e.url);
  const actual = cards.map((c) => c.url).filter((u) => listed.some((e) => e.url === u));
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    errors.push("The All apps page cards are not ordered by featured number first, then live, beta, alpha, each A to Z.");
  }

  const expectedFeatured = listed
    .filter((e) => e.featured !== undefined)
    .sort((a, b) => a.featured - b.featured || a.name.localeCompare(b.name))
    .map((e) => e.url);
  if (JSON.stringify(expectedFeatured) !== JSON.stringify(featuredCards.map((c) => c.url))) {
    errors.push("The Apps section on the home page must hold exactly the featured apps, in featured-number order.");
  }

  for (const card of [...featuredCards, ...cards]) {
    const entry = entries.find((e) => e.url === card.url);
    if (!entry) {
      errors.push(`index.html has a directory card for "${card.name}" (${card.url}) with no matching catalog.json entry.`);
    } else if (entry.unlisted) {
      errors.push(`index.html has a directory card for "${card.name}" but catalog.json marks it unlisted. Remove the card.`);
    }
  }

  if (errors.length > 0) {
    console.error("catalog.json and index.html are out of sync:\n");
    for (const error of errors) console.error(`  - ${error}`);
    console.error("\nUpdate both files together — see README.md's \"Directory entries\" section.");
    process.exit(1);
  }

  console.log(`catalog.json and index.html agree on ${listed.length} listed apps (${entries.length - listed.length} unlisted, ${featuredCards.length} featured).`);
}

main();
