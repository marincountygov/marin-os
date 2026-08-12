# MarinOS

MarinOS is the directory for apps and documentation built by County of Marin teams.

## Directory entries

`catalog.json` is the machine-readable directory contract. Every entry requires a stable ID, name, `app` or `docs` type, URL, task-focused description, audience, lifecycle status, and owner.

The HTML directory remains fully usable without JavaScript. When adding or changing an entry, update both `catalog.json` and the corresponding card in `index.html` in the same pull request.

## Brand bundle

The installed MarinOS bundle version is recorded in `BRAND_VERSION`. Update `shared/` and `vendor/` from the matching `marin-ui` release as a unit.

## Hosting assumption

Current links use conventional GitHub Pages project URLs under `marincountygov.github.io`. Confirm GitHub Pages or replace these URLs before publishing the directory.

## Testing with WAVE

Prefer testing a locally served HTTP URL such as `http://localhost:8000/` (`python3 -m http.server 8000`) instead of opening the page with `file://`. Firefox extensions, including WAVE, generally cannot evaluate `file://` pages unless "Allow access to file URLs" is enabled for the extension in `about:addons`. A page that stays gray after WAVE is selected usually means the extension could not evaluate the local page, not that the site added an overlay.
