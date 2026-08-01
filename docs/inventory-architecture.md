# Inventory, save import, and solver architecture

## Boundary

Feature components depend on `InventoryService` and immutable domain records.
Only an `InventoryGateway` knows how records are persisted. The current gateway
stores one document per anonymous owner in IndexedDB; no component or solver
imports IndexedDB directly.

Raw save bytes deliberately remain local. When Supabase is configured and a user signs in,
the browser syncs only normalized world metadata and owned Pal records through RPCs;
anonymous imports continue to live in IndexedDB until they are claimed by an account.

The `schemaVersion` on the document is independent from the Palworld game
version and enables deterministic local migrations before sync.

## Optional automatic refresh

Automatic refresh is connected automatically after a successful import made
with the File System Access API. The user selects the save source once; its
retained, read-only `FileSystemDirectoryHandle` is stored in a dedicated
IndexedDB database. Every open Palpath tab participates in a Web Locks election,
so at most one tab checks saves at a time.

Where Chromium exposes `FileSystemObserver`, recursive directory notifications
wake the refresh loop immediately. Because that API remains non-standard, the
inexpensive 15-second poll stays active as the production fallback and safety
net. It reads only the imported Steam world's `Level/01.sav` metadata. For Xbox,
it fingerprints the selected WGS account's file paths, sizes, and modified times
so opaque blob rotation is detected. After a change, two snapshots must match
across a debounce before Palpath parses the save. The normalized result is
compared semantically with the current profile; ordering, import timestamps,
and fallback display labels cannot cause an update. Identical results do not
change the local revision or call the Supabase sync RPC.

The poll exists only while a Palpath tab is open. Persisted folder permission
may return to `prompt` or `denied` after a browser restart. That state is kept
separate from a missing folder in both the service and UI. A user-triggered
Resume sync action calls `requestPermission()` on the retained handle, so the
browser can restore access without reopening the operating-system folder
picker. Choosing a source again is reserved for a missing, revoked, moved, or
intentionally changed folder. Chromium's picker ID is platform-specific so a
genuinely new Xbox or Steam source opens near its last-used location.

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
  An empty passive selection removes the passive constraint. Selected passives
  are required, while unselected passive slots remain unconstrained.
  “Cleanest” uses estimated expected cakes; probability copy is always labeled
  as estimated.
- The search combines compatible planned carriers as well as owned Pals, so
  both final parents may be independently bred branches. Route reconstruction
  preserves those dependencies as a parent tree instead of flattening them
  into an ambiguous sequence.
