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
node scripts/check-catalog-sync.js
node scripts/check-projects.js
node scripts/check-lighthouse.js
node scripts/check-security.js
node scripts/check-app-shell.js
if [[ "$BROWSER" == 1 ]]; then
  python3 tests/browser_app_shell.py
else
  printf 'SKIP: Browser checks not requested; run with --browser.\n'
fi
printf 'Requested MarinOS checks passed.\n'
