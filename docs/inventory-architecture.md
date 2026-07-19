# Inventory, save import, and solver architecture

## Boundary

Feature components depend on `InventoryService` and immutable domain records.
Only an `InventoryGateway` knows how records are persisted. The current gateway
stores one document per anonymous owner in IndexedDB; no component or solver
imports IndexedDB directly.

This is intentional preparation for accounts. Replacing the gateway with a
Supabase adapter must not change Parent Finder, Pal Builder, or the save parser.

## Planned Supabase model

| Table | Important columns |
| --- | --- |
| `user_profiles` | `user_id`, display name/avatar, timestamps |
| `workspaces` | `id`, personal/team kind, name, creator, timestamps |
| `workspace_members` | `workspace_id`, `user_id`, owner/editor/viewer role, timestamps |
| `world_snapshots` | `id`, `workspace_id`, stable identity key, world/player metadata, schema/game version, `revision`, JSONB payload, audit timestamps |

The current product replaces an imported world as one snapshot and does not
independently edit Pals. Store the validated world payload as one JSONB value
until individual Pal edits, cross-world SQL search, or incremental Pal sync is
an actual product requirement. Use a stable world identity to make re-import
idempotent. Use `revision` for optimistic concurrency and return a conflict
rather than silently overwriting a newer device.

RLS should require authenticated workspace membership for every read/write and
enforce owner/editor/viewer permissions. The browser must use only the public
publishable key; service-role credentials never belong in this app.

## Anonymous-to-account claim

1. Keep the device owner ID and local profile IDs after sign-in.
2. Create the account's personal workspace.
3. Upload each imported world independently and idempotently by stable identity.
4. Return the authoritative snapshot and revision.
5. Replace the local cache only after that world's upload succeeds.

The `schemaVersion` on the document is independent from the Palworld game
version and enables deterministic local migrations before sync.

See `scale-accounts-ads-plan.md` for implementation phases, cost controls,
licensing gates, and the ad-supported launch checklist.

## Save parser contract

The importer has four independent stages:

1. platform adapter (Steam folders or Xbox WGS containers),
2. strict Palworld 1.0 world-layout validation,
3. browser WASM decode of PLM/PLZ/GVAS bytes,
4. normalization into stable `OwnedPal` records plus player name/level metadata
   when the selected world contains exactly one identifiable player save.

Unsupported pre-1.0 worlds are hard errors. Unknown future identifiers are
reported and skipped without corrupting known records. Save bytes are read-only
and remain local to the browser.

Oodle support is isolated in the lazy-loaded `ooz-wasm` package, which is
GPL-3.0-or-later. The current application package is private. Any public
distribution that bundles the decoder requires a GPL compliance and licensing
review; this is a release gate, not an optional attribution note.

## Solver guarantees

- Parent Finder is a forward parent-pair lookup over the complete loaded 1.0 table.
- Path Finder uses breadth-first search over the complete table, so its
  continuous-carrier route has the minimum number of breedings.
- Pal Builder exhaustively searches the finite `(species, gender, required
  passive mask, carried passives)` carrier state space with owned partners.
  Every proposed pairing enforces one male and one female parent, including
  the oriented gender requirements for species-specific breeding exceptions.
  An `Any` passive goal removes the passive constraint, including the
  zero-passive outcome. “Cleanest” uses estimated expected cakes; probability
  copy is always labeled as estimated.
- Pal Builder deliberately distinguishes this exact carrier model from a future
  full breeding-DAG optimizer in which two independently synthesized children
  can become the final parents. That richer model can be added behind the same
  service API without changing inventory storage or UI inputs.
