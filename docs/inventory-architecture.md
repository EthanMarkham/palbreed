# Inventory, save import, and solver architecture

## Boundary

Feature components depend on `InventoryService` and immutable domain records.
Only an `InventoryGateway` knows how records are persisted. The current gateway
stores one document per anonymous owner in IndexedDB; no component or solver
imports IndexedDB directly.

This is intentional preparation for accounts. Replacing the gateway with a
Supabase adapter must not change Parent Finder, Pal Builder, or the save parser.

## Suggested Supabase model

| Table | Important columns |
| --- | --- |
| `inventory_profiles` | `id`, `owner_id`, `name`, `game_version`, `platform`, `account_id`, `world_id`, `slot_id`, player identity/level, `revision`, timestamps |
| `pal_instances` | `id`, `profile_id`, `source_instance_id`, `species_id`, `gender`, `passive_ids`, `location`, nickname/level |
| `import_runs` | `id`, `profile_id`, `slot_id`, parser version, counts, warnings, timestamp |
| `builder_sessions` | `id`, `profile_id`, target, required passives, objective, current plan, timestamp |

Use client-generated UUIDs already present in the local records. Match imported
profiles by platform plus stable world identity, then replace their Pals by
`source_instance_id`. This makes re-importing a world idempotent and removes
stale save-derived instances without accumulating duplicate world profiles.
Use the profile `revision` for optimistic concurrency and return a
conflict rather than silently overwriting a newer device.

RLS should require `owner_id = auth.uid()` through the profile relationship for
every read/write. The browser must use only the public anon key; service-role
credentials never belong in this app.

## Anonymous-to-account claim

1. Keep the device owner ID and local profile IDs after sign-in.
2. In one server transaction, insert or merge profiles for `auth.uid()`.
3. Upsert save-derived instances by `source_instance_id` within each world.
4. Return the authoritative document and revision.
5. Replace the local cache only after the transaction succeeds.

The `schemaVersion` on the document is independent from the Palworld game
version and enables deterministic local migrations before sync.

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
