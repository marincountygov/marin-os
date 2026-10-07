# Working on MarinOS

## Architecture

MarinOS consumes a pinned, locally vendored Marin App Shell. The shell owns the banner, header, routing, Updates, footer, Feedback, shared styling, and common helpers. MarinOS owns its static app/docs directory, catalog/project data, About, Projects, Security and Status inventories, and platform-wide Accessibility score table.

`marin.yml` records `project.type: platform`, the authoritative `project.status`, and `platform.shell`. The explicit banner label must match project.status. Do not change project maturity as part of a shell upgrade.

## Before making changes

1. Register an app in `catalog.json`, its matching static card in `index.html`, and `projects.json` together. Preserve name/URL/description/status and icon parity. Never convert the no-JavaScript directory into runtime-only rendering as part of maintenance.
2. Read the pinned App Shell component/integration documentation before adding shared behavior. Never edit `vendor/marinos/` or copy shell CSS/JS into `assets/`. Upgrade through the shell installer.
3. Keep the directory as the first `data-tab-section` group. Leave the platform-specific About, Projects, Security, Status, and Accessibility content in the app. `marin-app-info` generates only Updates to avoid duplicate IDs or replacing the platform inventories.
4. The header must contain only About and Updates. Security stays accessible from About and the required footer link, not the header.
5. Preserve the footer's `hide-platform-link` attribute and `template[data-footer-links]` containing Projects then Status. The shell supplies About, Security, Accessibility, Tech, Updates; the app name is plain text.
6. Only the header title text links to `./`; do not wrap the icon, subtitle, or status badge in the home link. Use the supplied layout-grid SVG for header/favicon identity.

## Before finishing

Run `bash scripts/check.sh`. It includes the existing catalog, project, Lighthouse, and security validators plus the new App Shell integration and managed-asset checks. Run `bash scripts/check.sh --browser` when Python Playwright and Chromium are available. State skipped or limited tests accurately; in-memory fixtures are not HTTP browser tests.

Review no-JavaScript directory use, all seven footer destinations, project filtering/sorting, the platform inventories, keyboard focus and Escape, narrow widths, and light/dark mode. Preserve `.nojekyll`, security files and reporting contacts. A shell upgrade is not a new security or accessibility review.

## Accessibility data

`data/lighthouse.json` is written by `scripts/lighthouse.js` and the weekly workflow. Do not hand-edit scores. The platform table uses this file and the App Shell `window.marinScoreGauge` helper. Do not replace it with a single-app score panel.

## Tech data

`data/tech.json` and `data/sbom/*.spdx.json` are written by `scripts/tech.js` and the "Update tech data" workflow. Do not hand-edit them. The portfolio table in `#tech` reads `tech.json`; the MarinOS block under it is filled by the App Shell. AI use is declared in each app's `marin.yml` (`ai:`) and is never inferred; a missing declaration stays "Not documented".

## Reference repositories

- `marin-app-shell`: component/runtime API, release installer, tests, and shared UI behavior.
- `marin-ui`: upstream design system, consumed through the shell rather than independently synced.
- `marin-digital-standards`: canonical content, accessibility, brand, and security standards.
- `marin-skills`: agent workflows for building and maintaining the apps.
- `marin-app-template`: starter for new apps, not an update source for existing applications.
