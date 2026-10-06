# App Shell 1.5.0 refactor

## Sources and scope

This refactor uses the supplied `marin-os-main(1).zip` and the corrected `marin-app-shell-main (2).zip`. The supplied shell reports version 1.5.0. Its distribution is installed unchanged with its own installer; its internal Marin UI pin is 1.19.0 and includes the shell's later score-gauge and status compatibility layers. This app no longer independently pins Marin UI 1.21.0.

The earlier specification assumed a generic Accessibility page. The latest supplied MarinOS already has a platform-wide Lighthouse score inventory, so that entire section and its app-owned loader are preserved. `marin-app-info sections="updates"` generates only Updates. The user also requested removal of Security from the header; header links are About and Updates. Security remains in the required footer set and in About.

## Changed ownership

The shell supplies the banner, title/status header, shared navigation and routing, Updates, footer, Feedback, table sorting, and score-gauge helper. The app retains its directory, About, Projects, Security, Status, Accessibility inventory, all data files, and scanner workflows. The old self-status IIFE is removed; the header reads `project.status` from `marin.yml`, and the banner's explicit label is validated against it.

The new footer uses `hide-platform-link` and a `data-footer-links` template with Projects and Status. The required About/Security/Accessibility/Updates set is added by the shell, never replaced.

Narrow-screen testing exposed overflow in the Security inventory; the Security and Status tables now use the existing `app-table-wrap` component with named, keyboard-focusable scrolling regions. Table contents and data sources are unchanged.

The old copied shared runtime, standalone Pico file, and `BRAND_VERSION` are deleted. Existing inline app styles move to `assets/app.css`; the favicon uses a local `assets/icon.svg` containing the same canonical layout-grid geometry as the header.

## Source archive and existing checkouts

The ZIP omits `.git`, editor caches, and font binaries. Preserve the existing two font files under `vendor/fonts/` when copying these source files into a checkout, or run the supplied App Shell installer's normal install command with a matching local font source. Open Sans and Lucide license files remain included. The strict integration check rejects missing/damaged fonts instead of silently accepting system fallbacks.

When overlaying into an existing checkout, remove the obsolete files explicitly; copying a ZIP does not record deletions:

```bash
git rm -- BRAND_VERSION shared/app-brand.css shared/app-shell.js vendor/pico.min.css
```

Review existing uncommitted work before replacing files. Do not use a delete-based directory synchronization that removes the retained font files or `.git`.

## Security scope

`security.json`, review dates, reporting contacts, schemas, and `.well-known/security.txt` are unchanged. The supplied configuration declares meta-delivered CSP and referrer policy, but the supplied page does not install those meta tags. This pre-existing declaration/enforcement mismatch is not silently corrected in a shell-only refactor. It needs a separate policy implementation review that accounts for local data, the GitHub API, and per-application security inventory requests. Passing the existing repository security validator does not establish browser-policy enforcement or WCAG conformance.

## Validation

Completed against the corrected supplied App Shell 1.5.0 and this refactored app:

- JavaScript and Python syntax; all four existing catalog/project/Lighthouse/security validators; the new App Shell integration and managed-file hash checks.
- App Shell install and `--check`, using the supplied app's original matching font assets. The shipped shell distribution is byte-for-byte unchanged.
- Preservation audit: static directory cards, specialized page prose (except the updated About architecture links), all catalog/project/Lighthouse/security data, schemas, reporting contacts, scanner code/workflow, and existing validators are preserved.
- Nine negative integration-check cases: unwanted Security header link, missing footer suppression, incorrect footer additions, mismatched banner status, wrong dependency version, runtime tampering, extra vendored file, obsolete brand marker, and missing font. Each failed as intended.
- Seventeen in-memory Chromium scenarios: six width/theme combinations (1440, 390, 320 pixels; light and dark), six direct route initializations plus an unknown route, three partial/missing-data cases, and the no-JavaScript directory. Each normal rendered page checks navigation, all route visibility, duplicate IDs, title/status behavior, inventories, project filtering/sorting, keyboard menus, and horizontal overflow. Font checks inspect both computed families and actual rendered custom fonts.
- Visual review of generated desktop/mobile directory and accessibility inventory images.

Full localhost HTTP browser navigation was attempted but blocked by the execution environment (`ERR_BLOCKED_BY_ADMINISTRATOR`). Therefore real HTTP asset delivery, deferred-script load timing, clicking the title to complete a fresh navigation, live API availability, and production deployment are not reported as verified here. Run `bash scripts/check.sh --browser` locally to exercise HTTP loading and title-home navigation; external API responses remain deterministic fixtures.

The supplied source archive omits font binaries. After preserving or installing the local fonts, rerun the strict checks before deployment. No general security audit or WCAG conformance certification is implied by these checks.
