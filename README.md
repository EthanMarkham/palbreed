# Palpath

A static Palworld 1.0 planner for finding the shortest pairing path needed to transfer passives between Pal species. Gender-specific outcomes are handled within the path when required.

## Commands

```sh
npm install
npm run dev
npm run lint
npm run build
```

Run `npm run data:generate` to refresh the versioned data artifacts from the current 1.0 source bundle. Pass a local bundle or direct URL after `--` to regenerate from a specific source.

## Data

The browser imports only `src/data/breeding-runtime-1.0.json`. The larger `breeding-1.0.json` is retained as the auditable release artifact, including source attribution, checksums, and reverse indexes used to validate a generated release.

See `docs/architecture.md` and `docs/data-contract.md` for the runtime and release boundaries.
