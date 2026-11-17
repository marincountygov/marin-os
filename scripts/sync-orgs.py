#!/usr/bin/env python3
"""Copy the list of County organizations from marin-data into data/organizations.json.

The organizations the project records name are looked up in this list. It is generated in marin-data
(organizations/index.json). data/organizations.json is a copy. Never edit it here.

  python3 scripts/sync-orgs.py           copy ../marin-data/organizations/index.json
  python3 scripts/sync-orgs.py --check   fail if the copy differs. Skipped when marin-data is not next to this repo.
"""
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "marin-data" / "organizations" / "index.json"
COPY = ROOT / "data" / "organizations.json"

if not SOURCE.is_file():
    if "--check" in sys.argv:
        print("skipped: marin-data is not next to this repo")
        sys.exit(0)
    sys.exit(f"not found: {SOURCE}")
if "--check" in sys.argv:
    if not COPY.exists() or COPY.read_bytes() != SOURCE.read_bytes():
        sys.exit("data/organizations.json differs from marin-data. Run: python3 scripts/sync-orgs.py")
    print("ok: data/organizations.json matches marin-data")
else:
    shutil.copyfile(SOURCE, COPY)
    print("copied data/organizations.json from marin-data")
