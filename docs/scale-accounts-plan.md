# Palpath scale and accounts plan

## Current decisions

- Keep the Vite client application. The solver, save decoding, and inventory
  operations stay in the browser so routine use does not create server compute
  cost.
- Keep Supabase optional. Signed-out users retain the complete local workflow;
  signed-in users can persist profiles, teams, and selected world snapshots.
- Use email magic links initially. Google, GitHub, and Discord remain supported
  by the client but are disabled unless intentionally configured.
- Do not include advertising code or AdSense deployment configuration.
- Show the original Pal WebP artwork from
  `https://palbreeder.com/pal-icons/`. The legal page identifies Palpath as an
  unofficial fan utility and attributes Palworld imagery to its rights holders.

## Architecture

The production app has three bounded layers:

1. Static generated breeding data and pure browser solvers.
2. Local browser storage for inventory, history, and offline operation.
3. Optional Supabase Auth plus revisioned world snapshots for account and team
   persistence.

There is no solver RPC. Moving deterministic solver work to Postgres would add
latency, database load, operational cost, and a second implementation without
improving the current product. Revisit a server solver only if measured client
performance or a trusted server-only feature requires it.

## Cost controls

- Upload only normalized world snapshots, never raw save files.
- Sync on explicit state changes instead of using Realtime subscriptions.
- Keep snapshots revisioned and use optimistic concurrency instead of an event
  log or collaborative document system.
- Do not add Edge Functions, Storage, queues, image transformation, or remote
  solver execution without a measured need.
- Track monthly active users, database size, Auth email volume, and egress.
  Upgrade Supabase only when actual usage or recovery requirements justify it.

## Security and operations

- Row-level security remains mandatory on every account and workspace table.
- Browser clients receive only the Supabase publishable key. Service-role and
  OAuth secrets never belong in `VITE_` variables.
- Workspace mutations stay behind authenticated, membership-checking database
  functions. Anonymous access remains denied.
- Test export, world deletion, invitation expiry, role changes, conflicts, and
  sign-out before each account-system release.
- Keep the production Site URL and redirect allow-list narrow. Preview builds
  should use a separate Supabase project before public team testing.

## Licensing boundary

- The generated breeding database retains its source attribution and MIT
  notice.
- Pal names, characters, and images remain the property of Pocketpair and/or
  their respective rights holders; restoring the images does not transfer or
  grant those rights.
- The optional save-import compatibility path includes `ooz-wasm` under
  GPL-3.0-or-later. Public distribution must keep corresponding source for the
  exact deployed build available and preserve generated third-party notices.

## Scale gates

Add infrastructure only after measurement demonstrates a specific constraint:

- Split or compress snapshot payloads when real snapshot percentiles approach
  Supabase row or egress limits.
- Add a server-side API only for trusted operations that RLS/database functions
  cannot safely express.
- Consider Next.js only for dynamic server-rendered public pages or a material
  server-only backend-for-frontend requirement.
- Consider Realtime only if users need simultaneous collaborative editing and
  polling or refresh-on-focus is measurably inadequate.
