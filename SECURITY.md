# Security

Every repository owns its security information. MarinOS defines the standard, defaults, tooling, and validation used across repositories. Common security configuration is standardized and generated wherever practical.

## Report a security issue

See [security.txt](.well-known/security.txt) for contact details. Please include what you found, how to reproduce it, and its potential impact. We'll acknowledge your report and follow up as we assess it.

## MarinOS's own security

MarinOS follows the same standard it defines for every application — see [`security.json`](security.json), built from the `internal` profile. Technical documentation, including how the standard, schema, and generators fit together, is in [`security/README.md`](security/README.md).

## For developers

- [`marin-digital-standards/security/standard.md`](https://github.com/marincountygov/marin-digital-standards/blob/main/security/standard.md) — the standard itself, including what GitHub Pages hosting can and can't enforce.
- [`marin-digital-standards/security/profiles.md`](https://github.com/marincountygov/marin-digital-standards/blob/main/security/profiles.md) — what each security profile requires.
- [`schemas/security.schema.json`](schemas/security.schema.json) — the machine-readable schema every app's `security.json` conforms to.
- [`schemas/profiles/`](schemas/profiles/) — default field values per profile, for starting a new app's `security.json`.
