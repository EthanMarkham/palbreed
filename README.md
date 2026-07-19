# Palpath

A browser-first Palworld 1.0 breeding suite centered on three workflows:

- local inventory profiles with Steam/Xbox save import;
- a passive-aware Pal Builder with wildcard or exact passive goals, acquisition gaps, and hatch estimates;
- condensed Path Finder and Parent Finder lookups across the complete breeding table, including gender-specific exceptions.

Save files are decoded locally and never modified or uploaded. Import is intentionally strict: only the Palworld 1.0 `LevelMeta.sav` + `Level/01.sav` world layout is accepted, while pre-1.0 worlds receive a typed error.

## Commands

```sh
npm install
npm run dev
npm test
npm run lint
npm run build
```

Run `npm run data:generate` to refresh the versioned breeding artifacts from the current 1.0 source bundle. Pass a local bundle or direct URL after `--` to regenerate from a specific source. The passive and save-alias generators require explicit local source files; their argument contracts are printed by `npm run data:passives` and `npm run data:save-aliases`.

## Data

The browser imports only `src/data/breeding-runtime-1.0.json`. The larger `breeding-1.0.json` is retained as the auditable release artifact, including source attribution, checksums, and reverse indexes used to validate a generated release.

See `docs/architecture.md`, `docs/data-contract.md`, and `docs/inventory-architecture.md` for the runtime, account/Supabase migration seam, save-parser boundary, solver guarantees, and release constraints.

## Save-decoder licensing

The structured-save wrapper is MIT-licensed. Oodle compatibility is provided by the separately lazy-loaded `ooz-wasm` dependency under GPL-3.0-or-later. Any public binary distribution that includes save import must complete the GPL compliance review described in `docs/inventory-architecture.md`.
