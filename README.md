# MarinOS

MarinOS is the directory for apps and documentation built by County of Marin teams.

## Directory entries

`catalog.json` is the machine-readable directory contract. Every entry requires a stable ID, name, `app` or `docs` type, URL, task-focused description, audience, status, and owner, plus an `icon` (`{viewBox, markup}` — the inner content of the app's icon `<svg>`, matching what's already hardcoded in every consumer's static MarinOS banner). `marin-ui/shared/app-shell.js` renders this catalog dynamically in the MarinOS banner menu of every consumer app; the `icon` field keeps that rendering visually identical to the static fallback markup consumers keep in their own HTML.

**`status`** is the app's maturity, one of:

- `alpha` — experimental, actively being developed, features may be incomplete or change significantly.
- `beta` — working core functionality, being tested with real users, may still change based on feedback.
- `live` — an established product, stable core functionality, ongoing maintenance.

See `#status` on the live site for the full explanation shown to end users, and this repo's own `scripts/check-catalog-sync.js` for the enforced enum. Progression is typically alpha → beta → live, but not automatic — changing an app's status means changing its `catalog.json` entry (and keeping that app's own `marin.yml` `project.status` in sync with it). This is a product-maturity concept, not a project-status one (planned/active/paused/etc.) — the two are expected to coexist if a project-lifecycle model (e.g. schemaGov's) is adopted later, without this field changing shape.

The HTML directory remains fully usable without JavaScript. When adding or changing an entry, update both `catalog.json` and the corresponding card (including its status badge) in `index.html` in the same pull request. A GitHub Actions check (`scripts/check-catalog-sync.js`) fails the PR if the two disagree, including on status — run `node scripts/check-catalog-sync.js` locally to check before pushing.

## Adding an app to MarinOS

This is the entire process — everything else updates itself:

1. Add an entry to `catalog.json`: id, name, type, url, description, audience, status, owner, and `icon` (`{viewBox, markup}` — reuse the icon already in the app's own MarinOS banner markup, so the directory and the banner show the same icon).
2. Add the matching directory card to `index.html` (same url/name/description as the `catalog.json` entry — `check-catalog-sync.js` enforces this).
3. Add the app's project record to `projects.json` (same name/url; `phase` matches its status).
4. Run `node scripts/check-catalog-sync.js` and `node scripts/check-projects.js` locally, commit the files together, push.

That's it — do not go and edit every other MarinOS app's `index.html`. Every consumer's MarinOS banner menu (the "MarinOS" dropdown, not the directory page itself) reads `catalog.json` at runtime via `marin-ui/shared/app-shell.js` and picks up the new entry automatically, typically within its 6-hour cache window. No other repo needs a commit for a new app to appear in every other app's banner. (The directory page itself, `index.html`, is intentionally static and does need step 2 above — see "Directory entries.")

## Brand bundle

The installed MarinOS bundle version is recorded in `BRAND_VERSION`. Update `shared/` and `vendor/` from the matching `marin-ui` release as a unit.

## Hosting assumption

Links use conventional GitHub Pages project URLs under `marincountygov.github.io`. Confirmed live (`curl -I https://marincountygov.github.io/marin-os/catalog.json` returns 200 with `access-control-allow-origin: *`), so consumer apps can `fetch()` `catalog.json` cross-origin without restriction.

## Security

MarinOS follows the same security standard it defines for every application — see [`SECURITY.md`](SECURITY.md), [`security.json`](security.json), the [schema](schemas/security.schema.json), and the [standard itself](https://github.com/marincountygov/marin-digital-standards/blob/main/security/standard.md). See [`security.txt`](.well-known/security.txt) to report a security issue. The public security page is at `#security` once published (see `security/README.md` for current status).

## Testing with WAVE

Prefer testing a locally served HTTP URL such as `http://localhost:8000/` (`python3 -m http.server 8000`) instead of opening the page with `file://`. Firefox extensions, including WAVE, generally cannot evaluate `file://` pages unless "Allow access to file URLs" is enabled for the extension in `about:addons`. A page that stays gray after WAVE is selected usually means the extension could not evaluate the local page, not that the site added an overlay.

## Projects

The `#projects` tab lists projects as [schemaGov Project](https://schema.govfresh.com/profiles/projects/) records, read live by `assets/app.js`:

- `projects.json` — MarinOS's own projects (one per catalog app).
- `external-projects.json` — projects that aren't part of MarinOS.

The table's Status column is the project's digital service phase (`phase`: alpha, beta, live), not its active/inactive `status`. `parentOrganization` and `member` entries need a `name` as well as an `@id`. Run `node scripts/check-projects.js` to validate both files.

## Accessibility

County of Marin digital services target [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/). The `#accessibility` tab shows each app's Google Lighthouse accessibility score. A score comes from automated testing and does not determine WCAG conformance.

- **Data:** `data/lighthouse.json` is the one file with every app's result, keyed by `catalog.json` id (MarinOS itself is `marin-os`). Shape: `schemas/lighthouse.schema.json`. Each app's own `#accessibility` section reads this same file from the MarinOS site.
- **Scanner:** `node scripts/lighthouse.js` runs the PageSpeed Insights API (v5, accessibility category) against each app's production URL. `--app marin-docs` rescans one app and keeps the others. `--dry-run` writes nothing. Check the file with `node scripts/check-lighthouse.js`.
- **API key:** the `PAGESPEED_API_KEY` GitHub secret. Locally, set the same environment variable. It is never written to the data file or printed. Without it the API still answers, but with a very small shared quota (a `429` error means that quota is used up).
- **When it runs** (`.github/workflows/lighthouse.yml`): weekly, and on demand from the Actions tab (**Run workflow**, optionally one app id). Both commit `data/lighthouse.json` to `main` as `github-actions[bot]`; that commit uses the built-in token, so it doesn't start another run. Pull requests only run a smoke check (a dry run on MarinOS's live site) because GitHub Pages has no preview sites, so the scan can't test a pull request's own changes.
- **Statuses:** `success`, `not-tested` (no URL), `unavailable` (the page couldn't be tested), `error` (the scan failed). A failed scan never becomes a score of 0; it keeps the last good score as `lastSuccess`. A score older than 14 days shows as out of date.
- **Local testing:** the API can't reach `localhost`. To test local changes, run `npx lighthouse http://localhost:8935/ --only-categories=accessibility`.
- **Troubleshooting:** `429` quota error: set `PAGESPEED_API_KEY`. `unavailable` for one app: open its URL. Every app `error`: check the secret and Google's API status.
