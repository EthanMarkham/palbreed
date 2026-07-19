# Palpath scale, accounts, teams, and ads plan

Status: core implementation completed on 2026-07-19. Live Supabase provisioning,
real-save size benchmarks, rights-holder/counsel clearance, and AdSense approval
remain external release gates. See `deployment-setup.md` for the exact handoff.

This plan is an engineering and release checklist, not legal advice. A qualified
attorney must close the two IP/copyleft gates identified below before an
ad-supported launch.

Implemented in the repository:

- Optional, dynamically loaded Supabase Auth with personal/team workspaces.
- Owner/editor/viewer membership, expiring one-time invites, and RLS-backed RPCs.
- Local-first whole-world sync with optimistic revisions, tombstones, explicit
  conflict resolution, and no raw-save upload.
- Route-scoped AdSense units behind a disabled-by-default build flag, generated
  ownership metadata and `ads.txt`, and no ad loading on sensitive routes.
- Privacy/legal pages and generated exact-version production dependency notices.

## Outcome

Palpath remains a static Vite application. Save parsing, breeding data, and all
solver work stay in the browser. Supabase is introduced only for real user
accounts, workspace membership, and versioned imported-world snapshots.

The initial cloud design deliberately excludes per-Pal rows, Realtime, remote
solver calls, Edge Functions, CRDTs, billing tables, and a Next.js migration.
Those are added only when a named product requirement crosses a trigger in this
plan.

Ads may be added after the licensing, game-IP, privacy, and ad-network gates are
closed. Commercial use and advertising are not prohibited by GPL, MIT, or
Apache-2.0 themselves. The unresolved issues are GPL distribution compliance
for `ooz-wasm` and permission to monetize a site using Palworld names, data,
and branding.

## Decisions

| Area | Decision now | Revisit only when |
| --- | --- | --- |
| Frontend | Keep Vite and TanStack Router | Dynamic public pages need SSR/ISR or a substantial server BFF exists |
| Solver | Keep the optimized Web Worker | Representative low-end devices miss an agreed performance target |
| Anonymous use | Keep IndexedDB/local storage; do not create cloud users | Never; local use remains a product feature |
| Account storage | One JSONB snapshot per imported world | Individual Pal edits, cross-world SQL search, or incremental Pal sync ships |
| Team model | Relational workspaces and memberships | Permission needs exceed owner/editor/viewer |
| Concurrency | Optimistic `revision` check | Users truly co-edit the same resource in real time |
| Remote compute | None | A secret, webhook, or measured compute requirement needs it |
| Ads | Contextual/non-personalized pilot after legal gates | Revenue evidence justifies more complex ad personalization |

## Current evidence

- `usePalBuilder` already runs the optimized solver in a module Web Worker.
- An imported world is a replaceable snapshot; individual Pals are not edited.
- Builder history contains at most eight local entries.
- The production breeding runtime is a static versioned artifact.
- The current production dependency outlier is `ooz-wasm` 2.0.0,
  GPL-3.0-or-later. Other direct production packages are MIT or Apache-2.0.
- `ooz-wasm` identifies the separate `powzix/ooz` project as its underlying
  native implementation. The right to redistribute that underlying code must
  be verified independently rather than inferred from the wrapper's license.
- The generated breeding artifact identifies PalCalc as MIT-licensed, but the
  generator currently hard-codes that conclusion and the underlying Palworld
  content remains Pocketpair property.
- The product uses Palpath-owned, deterministic neutral avatars. No PalBreeder
  icon hotlinks or third-party character images are shipped.

## Phase 0: measure before designing storage

Use real, user-authorized saves to measure the serialized cloud DTO for:

1. A small solo world.
2. A mature solo world.
3. A large multiplayer world.
4. The largest valid world available for testing.

Record Pal count, uncompressed JSON bytes, compressed transfer bytes, parse
time, IndexedDB write time, and Web Worker solve p50/p95. Do not retain the save
files or player identifiers after the measurement.

Define the cloud payload separately from the in-memory domain model. Store
world/player metadata once at the snapshot level and do not repeat `worldId` or
`playerId` in every Pal. Keep a schema version and validate every downloaded
payload with Zod.

Exit criteria:

- A checked-in benchmark report contains p50/p95 snapshot sizes and solve time.
- The projected database and egress formulas use measured values rather than an
  assumed world size.
- Plain JSONB is confirmed for the first release or rejected with evidence.

## Phase 1: close licensing and game-IP gates

This phase blocks ads and public commercial promotion. It does not block local
engineering work.

### 1.1 Create a reproducible third-party notice bundle

- Add a root project license or an explicit `UNLICENSED`/all-rights-reserved
  statement while the GPL decision remains open.
- Add `THIRD_PARTY_NOTICES.md` containing exact versions, copyright notices,
  license texts/links, and source locations for production JavaScript and Rust
  dependencies.
- Include the PalCalc MIT notice (Copyright 2024, Tyler Camp), the exact dataset
  version/commit or release, and the data generator checksum.
- Include the pinned `uesave-rs` commit and MIT notice.
- Preserve the complete GPL-3.0-or-later text and exact `ooz-wasm` source
  revision corresponding to the distributed binary.
- Trace the license and copyright provenance of the underlying `powzix/ooz`
  source included in the WASM build. A wrapper license cannot grant rights its
  authors do not hold; obtain written clarification or replace the decoder if
  the chain cannot be documented.
- Generate an SBOM/license report in CI and fail releases on a new unknown,
  copyleft, non-commercial, or unlicensed production dependency.

### 1.2 Decide the `ooz-wasm` distribution path

The browser downloads and executes the `ooz-wasm` JavaScript/WASM object code.
Treat that as GPL conveyance. Lazy loading and a separate chunk are useful
technical boundaries but are not, by themselves, a legal conclusion that the
rest of the application is outside GPL copyleft.

Choose exactly one path:

1. Preferred proprietary/permissive path: replace `ooz-wasm` with a dependency
   whose license permits the intended distribution, or obtain written
   additional permission/commercial terms from the relevant copyright holders.
2. Open-source compliance path: after counsel confirms the combined-work
   boundary, license every covered portion compatibly with GPL-3.0-or-later and
   publish complete corresponding source for the exact deployed build,
   including build scripts, lockfiles, interface code, modifications, and clear
   source-download directions next to the object-code download/legal notice.
3. Feature-reduction path: do not distribute the Oodle decoder and clearly
   disable imports that require it until path 1 or 2 is complete.

Do not rely on an upstream GitHub repository alone as the source offer. Palpath
must ensure that corresponding source for the exact deployed binary remains
available for as long as Palpath distributes it.

Exit criteria:

- Written counsel memo or written additional permission identifies the chosen
  path and covered components.
- The source-rights record covers both the WASM wrapper and every bundled
  upstream native source component.
- A clean production build can be traced to the source bundle offered in the
  site's legal page.
- The footer/legal menu exposes licenses, notices, source access, modification
  status, and warranty disclaimer where required.

### 1.3 Clear Palworld names and data for ad-supported use

Pocketpair's derivative-work guideline permits fan works generally but
prohibits highly commercial, profit-oriented use and reserves takedown rights.
It does not expressly approve an ad-supported breeding calculator using
official Pal icons. Advertising makes this question material even though the
current product no longer displays character artwork.

- Send Pocketpair/Palworld Entertainment a written request describing the
  exact product: a free unofficial breeding calculator, local save parsing,
  intended ad placement, no sale of saves or game assets, and the specific use
  of Pal names and breeding data.
- Ask separately for permission to display and self-host an official icon set if
  that is ever reintroduced. Permission to display is not automatically
  permission to copy or host.
- Ask PalBreeder for data-redistribution permission while its transformed data
  remains the generator input.
- Preserve the request, response, scope, date, contact, and any required
  attribution in the release record.
- Add an attorney-reviewed unofficial-fan disclaimer and avoid Pocketpair or
  Palworld logos, official trade dress, or language suggesting endorsement.

Fallback if permission is denied or remains unresolved:

- Official/derived Pal images are already removed from the product.
- Use Palpath-owned neutral UI marks, text names only where counsel approves
  nominative use, and no official screenshots, logos, or character art.
- Do not treat hotlinking as a copyright or commercial-use workaround.

Exit criteria:

- Written permission covers the actual monetized use, or counsel signs off on
  the reduced text/neutral-art presentation.
- The dataset source is pinned to an auditable PalCalc version and its MIT
  notice is shipped.
- The generator no longer hard-codes a license claim without a pinned evidence
  record.

## Phase 2: minimal account and workspace foundation

Add Supabase Auth to the existing Vite app. Start with one audience-aligned
OAuth provider. Do not enable Supabase anonymous sign-ins. Add email sign-in
only after custom SMTP, abuse controls, and recovery flows are production-ready.

Initial tables:

| Table | Purpose |
| --- | --- |
| `user_profiles` | User-controlled display name/avatar needed by workspace UI |
| `workspaces` | Personal or team ownership boundary |
| `workspace_members` | User membership and owner/editor/viewer role |
| `world_snapshots` | Versioned metadata plus validated JSONB inventory payload |

Each real account receives one personal workspace. All shareable records point
to `workspace_id`; they never point directly to an owner user. Add a unique
`(workspace_id, identity_key)` constraint for idempotent world replacement.

Enable RLS on every exposed table. Index every column used by an RLS policy.
Policies must require authenticated membership and enforce role-specific writes.
No service-role key may enter the browser bundle.

Exit criteria:

- Migration files recreate the project from zero.
- RLS tests prove cross-workspace reads and writes fail.
- Account deletion, export, and session revocation are designed before beta.
- Supabase publishable configuration is separated by environment.

## Phase 3: local-first snapshot sync

IndexedDB remains the immediate local store and offline cache. Real accounts
gain an explicit sync coordinator rather than replacing the local gateway with
network-only persistence.

Sync rules:

1. Load local data immediately.
2. After authentication, fetch accessible snapshot metadata.
3. Download only selected or changed snapshots.
4. Upload imported worlds individually; never upload raw `.sav` bytes.
5. Upsert by stable world identity and validate `expected_revision`.
6. Return a typed conflict instead of silently overwriting another device.
7. Cache a successful remote result locally only after schema validation.
8. Expose `local`, `syncing`, `synced`, `offline`, and `conflict` states.

Use one small Postgres RPC, such as `replace_world_snapshot`, for atomic
identity/revision checking and snapshot replacement. Do not put solver logic in
the RPC.

Anonymous-to-account claim uploads one world at a time and is idempotent. It is
restartable after network failure and does not require one giant transaction.

Exit criteria:

- Import, re-import, delete, offline use, interrupted claim, and revision
  conflict have automated tests.
- Raw save bytes are absent from network logs and Supabase storage.
- A user can export and delete every cloud snapshot from the product UI.

## Phase 4: teams without live-collaboration machinery

Add workspace creation, invite acceptance, membership management, role changes,
and workspace switching. Add `workspace_invites` only at this phase.

Use database transactions/RPCs for invite acceptance and last-owner protection.
Do not add Realtime initially. A world import is a snapshot replacement, so
optimistic conflict handling and explicit refresh are sufficient.

Exit criteria:

- Viewers cannot mutate; editors cannot administer membership; owners can.
- The final owner cannot accidentally leave or be removed.
- Expired/revoked/replayed invitations fail.
- Audit fields identify who imported, replaced, or deleted a world.

## Phase 5: cost-controlled production deployment

Keep the frontend static and solver local so searches create no backend cost.

Expected baseline using prices checked on 2026-07-19:

| Deployment | Expected fixed baseline |
| --- | --- |
| Private/local beta | $0/month |
| Supabase Free account beta | $0/month, with pause/no-backup limitations |
| Cloudflare Pages + Supabase Pro | About $25/month plus domain, email, and ads tooling |
| Vercel Pro + Supabase Pro | About $45/month plus domain, email, and ads tooling |

The Supabase Team plan is not required for Palpath team workspaces; it is a plan
for administration/compliance of the Supabase organization.

Cost controls:

- Keep solving, save parsing, and static breeding data off the backend.
- Fetch snapshots on selection/change, not every route transition.
- Store one world payload rather than thousands of Pal rows until a feature
  needs normalization.
- Do not enable Realtime, Edge Functions, image transformations, or remote logs
  by default.
- Enable spend caps/alerts and track MAU, database bytes, egress, snapshot
  count, and p50/p95 payload size monthly.
- Recalculate the runway whenever measured average snapshot size changes by
  25 percent or a new synced artifact is introduced.

## Phase 6: privacy-safe ad pilot

This phase begins only after every Phase 1 exit criterion is satisfied.

Start with contextual or non-personalized ads. Limit placement to content-heavy
public Builder/Tools pages. Do not load ad code on save-import, inventory,
account, workspace administration, privacy, or legal pages. Do not expose save
metadata, player identity, target selections, inventory contents, or Supabase
identifiers to the ad request.

Required product work:

- Publish attorney-reviewed privacy, cookie, terms, copyright/contact, and
  third-party notices pages.
- Use a Google-certified CMP where required for EEA/UK/Swiss ad serving; offer
  an equally easy reject path and persist consent choices.
- Implement applicable US opt-out/GPC handling and a vendor/data-retention
  inventory.
- Obtain a COPPA/age-audience assessment before personalized advertising. A
  game-themed site with animated characters must not assume it is automatically
  general-audience.
- Configure CSP and route-scoped ad loading; verify third-party scripts never
  execute on the local save-import surface.
- Add `ads.txt`, clear ad labels, reserved layout slots, accessibility checks,
  and Core Web Vitals budgets.
- Keep ads away from navigation/action controls and ensure publisher content
  materially exceeds advertising.
- Keep all ad loading behind the single `VITE_ADSENSE_ENABLED` deployment flag
  so it can be removed with an immediate host rebuild/rollback. Do not add a
  paid remote-feature-flag service solely for this switch.

Exit criteria:

- Counsel signs off on IP, GPL, privacy, and audience classification.
- The chosen ad network approves the site and its IP provenance.
- Consent, reject, opt-out, and no-consent flows are tested by region.
- Ads do not load on sensitive routes or degrade solver/import correctness.
- Revenue and performance are measured for one limited placement before adding
  another.

## Phase 7: launch and operations

- Complete restore testing and define an account-data recovery objective.
- Add uptime and error monitoring without recording inventory or player data.
- Publish a security contact and dependency-update policy.
- Add automated dependency, SBOM, license, RLS, build, test, and lint gates.
- Keep a release evidence bundle containing deployed commit, generated-data
  checksum, third-party notices, source offer, permissions, and policy versions.
- Review Pocketpair guidelines, ad-network policy, dependency licenses, and
  pricing at least quarterly and before every major monetization change.

## Explicitly deferred work

Do not implement the following as preparatory architecture:

- Next.js migration.
- Postgres or Edge Function solver.
- `pal_instances` normalization.
- Supabase Realtime.
- General event sourcing, CRDTs, or background job infrastructure.
- Synced builder history before users ask for it.
- Payments/subscriptions before an actual paid product exists.
- Personalized or behavioral ads before the contextual pilot is proven and the
  privacy/audience work is complete.

## Reference evidence

- [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html)
- [GNU GPL JavaScript license labels](https://www.gnu.org/licenses/javascript-labels.en.html)
- [`ooz-wasm` repository](https://github.com/SnosMe/ooz-wasm)
- [`uesave-rs` repository](https://github.com/oMaN-Rod/uesave-rs)
- [PalCalc repository and MIT license](https://github.com/tylercamp/palcalc)
- [Pocketpair derivative-work guideline](https://www.pocketpair.jp/guidelines-derivativework/)
- [Pocketpair streaming/video guideline](https://www.pocketpair.jp/en/guidelines-video-en/)
- [Google Publisher Policies](https://support.google.com/adsense/answer/10502938)
- [Google European consent requirements](https://support.google.com/adsense/answer/10961068)
- [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [Supabase pricing](https://supabase.com/pricing)
- [Vercel pricing](https://vercel.com/pricing)
- [Cloudflare Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/)
