# Working on MarinOS

## Architecture

MarinOS is the app/docs directory for the County of Marin digital platform — a consumer of the `marin-ui` brand bundle like any other app, plus `catalog.json`, the machine-readable list of registered apps that backs the directory cards in `index.html`.

## Before making changes

1. Registering a new app means adding it to **both** `catalog.json` and the matching directory card in `index.html` — `scripts/check-catalog-sync.js` verifies they agree. It also needs a matching entry in `projects.json` — `scripts/check-projects.js` verifies that.
2. Check `marin-ui/docs/components.md` before writing new CSS or JS.
3. Keep the default view (the directory) immediately functional; ecosystem/ "start here" links and about-MarinOS content belong in the About tab.

## Before finishing

Run `node scripts/check-catalog-sync.js`, `node scripts/check-projects.js` and `node scripts/check-lighthouse.js` and resolve any mismatch. There is no broader automated check command yet.

## Accessibility data

`data/lighthouse.json` is written by `scripts/lighthouse.js` (weekly workflow). Don't hand-edit it. A new app in `catalog.json` gets an entry on the next scan (`node scripts/lighthouse.js --app <id>`).

## References

- `marin-ui` — shared components, tokens, app shell: https://github.com/marincountygov/marin-ui
- `marin-digital-standards` — accessibility, content, brand, and product-design requirements: https://github.com/marincountygov/marin-digital-standards
- `marin-skills` — AI workflows for building and reviewing Marin applications, including `marin-app-builder` and `app-maintainer`: https://github.com/marincountygov/marin-skills
- `marin-app-template` — the scaffold new apps are built from: https://github.com/marincountygov/marin-app-template
