# MarinOS

MarinOS is the directory for apps and documentation built by County of Marin teams.

## Directory entries

`catalog.json` is the machine-readable directory contract. Every entry requires a stable ID, name, `app` or `docs` type, URL, task-focused description, audience, lifecycle status, and owner, plus an `icon` (`{viewBox, markup}` — the inner content of the app's icon `<svg>`, matching what's already hardcoded in every consumer's static MarinOS banner). `marin-ui/shared/app-shell.js` renders this catalog dynamically in the MarinOS banner menu of every consumer app; the `icon` field keeps that rendering visually identical to the static fallback markup consumers keep in their own HTML.

The HTML directory remains fully usable without JavaScript. When adding or changing an entry, update both `catalog.json` and the corresponding card in `index.html` in the same pull request. A GitHub Actions check (`scripts/check-catalog-sync.js`) fails the PR if the two disagree — run `node scripts/check-catalog-sync.js` locally to check before pushing.

## Adding an app to MarinOS

This is the entire process — everything else updates itself:

1. Add an entry to `catalog.json`: id, name, type, url, description, audience, status, owner, and `icon` (`{viewBox, markup}` — reuse the icon already in the app's own MarinOS banner markup, so the directory and the banner show the same icon).
2. Add the matching directory card to `index.html` (same url/name/description as the `catalog.json` entry — `check-catalog-sync.js` enforces this).
3. Run `node scripts/check-catalog-sync.js` locally, commit both files together, push.

That's it — do not go and edit every other MarinOS app's `index.html`. Every consumer's MarinOS banner menu (the "MarinOS" dropdown, not the directory page itself) reads `catalog.json` at runtime via `marin-ui/shared/app-shell.js` and picks up the new entry automatically, typically within its 6-hour cache window. No other repo needs a commit for a new app to appear in every other app's banner. (The directory page itself, `index.html`, is intentionally static and does need step 2 above — see "Directory entries.")

## Brand bundle

The installed MarinOS bundle version is recorded in `BRAND_VERSION`. Update `shared/` and `vendor/` from the matching `marin-ui` release as a unit.

## Hosting assumption

Links use conventional GitHub Pages project URLs under `marincountygov.github.io`. Confirmed live (`curl -I https://marincountygov.github.io/marin-os/catalog.json` returns 200 with `access-control-allow-origin: *`), so consumer apps can `fetch()` `catalog.json` cross-origin without restriction.

## Testing with WAVE

Prefer testing a locally served HTTP URL such as `http://localhost:8000/` (`python3 -m http.server 8000`) instead of opening the page with `file://`. Firefox extensions, including WAVE, generally cannot evaluate `file://` pages unless "Allow access to file URLs" is enabled for the extension in `about:addons`. A page that stays gray after WAVE is selected usually means the extension could not evaluate the local page, not that the site added an overlay.
