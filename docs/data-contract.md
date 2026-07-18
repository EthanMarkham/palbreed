# Palworld data contract

The production calculator reads only static, generated data shipped with the application. It never calls a third-party Pal API in the browser.

## Identity

`PalId` identifies one exact breedable form. A base Pal and every elemental, regional, or named form are independent records and independent breeding participants. A shared dex number is display metadata only and must never be used as a lookup key.

## Required source fields

Each source release must provide a stable form ID, display name, form name when applicable, breedability, elements, stats, image attribution, and the full authoritative unordered parent-pair to child table. The import is rejected when a parent or child does not resolve to a known form.

## Generated indexes

The generator emits canonical form-specific `palsById`, `childByParentPair`, `parentPairsByChild`, and `partnerIdsByParentAndChild` indexes. Parent-pair keys are alphabetically ordered IDs. Gender-dependent combinations are emitted in `genderedChildrenByParentPair` and `genderedRules` instead of being flattened into an incorrect deterministic result. Releases include the game version, source URL, retrieval date, license/attribution, and content checksum.

## Regeneration

Run `npm run data:generate` to discover and download the current 1.0 data bundle linked by `https://palbreeder.com/`, validate it, and replace `src/data/breeding-1.0.json`. A downloaded bundle path or direct bundle URL can be passed after `--` for reproducible or offline generation.

## Release gate

No source is promoted without a form-coverage review, duplicate-pair validation, forward/reverse index validation, and golden tests for normal, special, same-parent, and form-specific combinations. The legacy pre-1.0 data is a compatibility input only and is not an approved 1.0 source.
