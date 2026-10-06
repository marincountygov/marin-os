# Third-party notices

MarinOS vendors the unmodified Marin App Shell 1.5.0 distribution in `vendor/marinos/`. Its manifest identifies the pinned Marin UI baseline and included assets. The generated stylesheet includes the Pico CSS baseline and retains its license header.

Shared runtime notices are in `vendor/marinos/licenses/`. The canonical shell-owned Lucide SVGs and their license are also installed in `vendor/icons/lucide/`. App-specific catalog icons and their existing geometry are preserved by this refactor.

Jost and Open Sans are first-party-hosted runtime assets supplied by the local Marin UI source or verified App Shell cache. The standard paths and expected hashes are recorded in the shell manifest. The Open Sans license is retained at `vendor/fonts/open-sans/OFL.txt`. The source handoff archive omits the two font binaries; preserve or install them locally before deployment.
