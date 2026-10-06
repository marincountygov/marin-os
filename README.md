# MarinOS

MarinOS is the directory for apps and documentation built by County of Marin teams.

## Directory entries

`catalog.json` is the machine-readable directory contract. Every entry requires a stable ID, name, `app` or `docs` type, URL, task-focused description, audience, status, and owner, plus an `icon` (`{viewBox, markup}`). Keep the icon geometry consistent with the registered app's header and favicon. App Shell renders the catalog in its MarinOS banner menu; consumer apps do not need to copy menu markup when the catalog changes.

**`status`** is the app's maturity, one of:

- `alpha` — experimental, actively being developed, features may be incomplete or change significantly.
- `beta` — working core functionality, being tested with real users, may still change based on feedback.
- `live` — an established product, stable core functionality, ongoing maintenance.

See `#status` on the live site for the full explanation shown to end users, and this repo's own `scripts/check-catalog-sync.js` for the enforced enum. Progression is typically alpha → beta → live, but not automatic — changing an app's status means changing its `catalog.json` entry (and keeping that app's own `marin.yml` `project.status` in sync with it). This is a product-maturity concept, not a project-status one (planned/active/paused/etc.) — the two are expected to coexist if a project-lifecycle model (e.g. schemaGov's) is adopted later, without this field changing shape.

The HTML directory remains fully usable without JavaScript. When adding or changing an entry, update both `catalog.json` and the corresponding card (including its status badge) in `index.html` in the same pull request. A GitHub Actions check (`scripts/check-catalog-sync.js`) fails the PR if the two disagree, including on status — run `node scripts/check-catalog-sync.js` locally to check before pushing.

## Adding an app to MarinOS

This is the entire process — everything else updates itself:

1. Add an entry to `catalog.json`: id, name, type, url, description, audience, status, owner, and `icon` (`{viewBox, markup}` — reuse the app's header/favicon icon, so the directory and banner show the same identity).
2. Add the matching directory card to `index.html` (same url/name/description as the `catalog.json` entry — `check-catalog-sync.js` enforces this).
3. Add the app's project record to `projects.json` (same name/url; `phase` matches its status).
4. Run `node scripts/check-catalog-sync.js` and `node scripts/check-projects.js` locally, commit the files together, push.

That's it — do not go and edit every other MarinOS app's `index.html`. Every consumer's MarinOS banner menu (the "MarinOS" dropdown, not the directory page itself) reads `catalog.json` at runtime through App Shell and picks up the new entry automatically. App Shell 1.5.0 can render a cached catalog first and also refreshes it on page load. No other repo needs a commit for a new app to appear in every other app's banner. (The directory page itself, `index.html`, is intentionally static and does need step 2 above — see "Directory entries.")

## App Shell

MarinOS vendors **Marin App Shell 1.5.0**, pinned by `platform.shell` in `marin.yml`. Shared runtime files live in `vendor/marinos/` and must not be edited inside this app. App Shell includes the shared CSS/Pico baseline, navigation, title status badge, Updates, footer, Feedback, table sorting, and accessibility score-gauge helper.

MarinOS owns the static directory, About content, Projects UI, app-status definitions/inventory, platform security inventory, and the platform-wide accessibility score table. The latest source includes that full accessibility inventory, so `marin-app-info sections="updates"` creates only Updates; it does not replace the custom Accessibility, About, or Security sections.

The header contains **About** and **Updates**, not Security. Only the title text links home. The local header badge reads `project.status` from this app's `marin.yml`; the banner's explicit `label="beta"` is checked against that same value by `scripts/check-app-shell.js`.

The platform-home footer is configured as:

```html
<marin-app-footer app-name="MarinOS" hide-platform-link>
  <template data-footer-links>
    <a href="#projects">Projects</a>
    <a href="#status">Status</a>
  </template>
</marin-app-footer>
```

The footer renders the plain-text MarinOS name, then **Projects, Status, About, Security, Accessibility, Updates**. App Shell appends the four required links; the template only supplies Projects and Status. There is no separate bottom link back to MarinOS.

### Install or update shared assets

Use a sibling checkout of the reviewed App Shell release, with its matching local Marin UI font source or verified font cache:

```bash
cd ../marin-app-shell
bash scripts/install.sh ../marin-os --dry-run
bash scripts/install.sh ../marin-os
bash scripts/install.sh ../marin-os --check
```

The installer updates `vendor/marinos/`, the specific managed font/icon files, and the existing `platform.shell` scalar together. It preserves application content, other icons, `template: manual`, `project.type: platform`, and security configuration. It does not commit or push changes. Do not restore separate Pico or copied shared-brand files.

**Source ZIP setup:** font binaries are not included in this handoff archive. Preserve `vendor/fonts/Jost-wght.ttf` and `vendor/fonts/open-sans/OpenSans-VariableFont_wdth,wght.woff2` from your existing checkout, or run the App Shell installer above with `--font-source ../marin-ui` before validation/deployment. The expected font paths and hashes are recorded in `vendor/marinos/manifest.json`; the Open Sans license is included. Do not deploy an incomplete font directory.

## Run and validate locally

Serve the repository over HTTP, not `file://`:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. The root directory remains usable without JavaScript; routed information pages and live inventories require it.

Run all read-only development checks:

```bash
bash scripts/check.sh
```

Node.js is used for development validation, not as an application runtime. These checks retain the catalog, project, Lighthouse, and security validators and add component/asset integrity checks. CI also runs the new integration check.

Optional browser integration tests use Python Playwright and Chromium:

```bash
bash scripts/check.sh --browser
```

The browser test serves the real app beneath `/marin-os/` over HTTP. Local assets and data load from this checkout; GitHub commit data and other apps' security responses use deterministic fixtures, so it does not check live external service availability. It covers all routes, both navigation menus, the platform footer, inventories, project filters/sorting, title-to-home navigation, themes, keyboard behavior, fonts, and the JavaScript-disabled directory.

For restricted environments that cannot navigate to localhost, `python3 tests/browser_app_shell.py --fixtures` performs explicitly limited in-memory rendering tests instead. This is not an HTTP, load-timing, or deployment test. See `docs/refactor-notes.md` for the handoff validation record.

## Hosting assumption

Links retain the supplied GitHub Pages project URLs under `marincountygov.github.io`. The local MarinOS banner explicitly reads `catalog.json` from the current checkout and browses to `./`. Other apps use the published catalog URL. Verify cross-origin access when changing hosting; this refactor does not verify production availability.

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
