#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
BROWSER=0
case "${1:-}" in
  "") ;;
  --browser) BROWSER=1 ;;
  -h|--help) printf 'Usage: bash scripts/check.sh [--browser]\n'; exit 0 ;;
  *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { printf 'Too many arguments\n' >&2; exit 2; }
command -v node >/dev/null || { printf 'Node.js is required for development checks (not the deployed app).\n' >&2; exit 1; }
cd "$ROOT_DIR"
node --check assets/app.js
python3 vendor/marinos/audit-buttons.py . --fail
# An h1 has one of two sizes (Marin UI 1.41.0); this lists app CSS that sets its own size and must list nothing.
python3 vendor/marinos/audit-h1.py . --fail
node scripts/check-catalog-sync.js
# The organizations the project records name come from marin-data. Skipped when marin-data is not next to this repo.
# Every file marin-data gives this app is a copy. Skipped when marin-data is not next to this repo.
if [[ -f "$ROOT_DIR/../marin-data/scripts/sync_copies.py" ]]; then
  python3 "$ROOT_DIR/../marin-data/scripts/sync_copies.py" "$ROOT_DIR" --check
else
  printf 'SKIP: marin-data is not next to this repo; its copies were not checked.\n' >&2
fi
node scripts/check-projects.js
node scripts/check-search-index.js
node scripts/check-lighthouse.js
node scripts/check-tech.js
node scripts/check-security.js
node scripts/check-app-shell.js
if [[ "$BROWSER" == 1 ]]; then
  python3 tests/browser_app_shell.py
else
  printf 'SKIP: Browser checks not requested; run with --browser.\n'
fi
printf 'Requested MarinOS checks passed.\n'
