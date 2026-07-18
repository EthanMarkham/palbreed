# Palworld data contract

The production calculator reads only static, generated data shipped with the application. It never calls a third-party Pal API in the browser.

## Identity

`PalId` identifies one exact breedable form. A base Pal and every elemental, regional, or named form are independent records and independent breeding participants. A shared dex number is display metadata only and must never be used as a lookup key.

## Required source fields

Each source release must provide a stable form ID, display name, form name when applicable, breedability, elements, stats, image attribution, and the full authoritative unordered parent-pair to child table. The import is rejected when a parent or child does not resolve to a known form.

## Generated artifacts

The generator emits two versioned artifacts from the same validated source. `breeding-1.0.json` is the canonical release table with form-specific `palsById`, `childByParentPair`, `parentPairsByChild`, and `partnerIdsByParentAndChild` indexes. `breeding-runtime-1.0.json` is the compact browser payload containing only Pal identity, the encoded pair matrix, release identity/counts, and gender rules. The repository rebuilds only its required lookup maps from that matrix once at startup.

Parent-pair keys are alphabetically ordered IDs. Gender-dependent combinations are emitted in `genderedChildrenByParentPair` and `genderedRules` instead of being flattened into an incorrect deterministic result. The canonical artifact retains the source URL, retrieval date, license/attribution, and content checksum; the runtime artifact carries only fields required by the browser.

## Regeneration

Run `npm run data:generate` to discover and download the current 1.0 data bundle linked by `https://palbreeder.com/`, validate it, and replace both generated artifacts. A downloaded bundle path or direct bundle URL can be passed after `--` for reproducible or offline generation.

## Release gate

No source is promoted without a form-coverage review, duplicate-pair validation, forward/reverse index validation, and golden checks for normal, special, same-parent, and form-specific combinations.
