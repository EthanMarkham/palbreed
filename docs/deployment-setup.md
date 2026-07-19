# Production setup: Supabase and AdSense

The application remains fully local when no environment variables are set.
Supabase and AdSense are independent, optional integrations. Never put a
Supabase service-role key, OAuth client secret, or AdSense account credential in
a `VITE_` variable; every `VITE_` value is public browser configuration.

## Supabase

### 1. Create and migrate the project

1. Create one Supabase project in the region closest to the expected users.
2. Install/login to the Supabase CLI, run `supabase init` once if the local
   `config.toml` does not exist, link the repository to the project, and run
   `supabase db push`. The migration in `supabase/migrations` creates the
   profile, workspace, membership, invitation, and snapshot model.
3. Run `supabase test db`. The pgTAP suite verifies cross-workspace isolation,
   owner/editor/viewer enforcement, and the denial of direct browser writes.
4. Keep separate Supabase projects for preview/staging and production. Never
   point pull-request previews at production data.

### 2. Configure authentication

1. In Authentication > URL Configuration, set the production Site URL.
2. Add the production account route and local development to Redirect URLs,
   including invite query strings. Examples:
   `https://your-domain.example/account*` and
   `http://localhost:5173/account*`.
3. Enable one OAuth provider. Discord is the default; Google and GitHub are also
   supported through `VITE_SUPABASE_OAUTH_PROVIDER`.
4. In the selected provider's developer console, use Supabase's callback URL:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Put the provider client ID and secret only in Supabase's provider settings.
6. Leave anonymous sign-ins disabled. Leave email/password sign-in disabled
   until custom SMTP, recovery, and abuse controls are intentionally added.

### 3. Configure deployment variables

Copy `.env.example` into the host's environment settings and set:

- `VITE_SUPABASE_URL`: Project URL from Project Settings > API.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the publishable key. A legacy anon key also
  works, but use the current publishable key for a new project.
- `VITE_SUPABASE_OAUTH_PROVIDER`: `discord`, `google`, or `github`.
- `VITE_LEGAL_CONTACT_EMAIL`: monitored privacy/deletion contact.
- `VITE_SOURCE_URL`: HTTPS URL for the exact deployed corresponding-source
  release, including application source, WASM interface code, build scripts,
  and lockfiles.

Do not set `VITE_ADSENSE_ENABLED` for Supabase-only deployments.

### 4. Production controls

- Upgrade from Free only when beta usage or backup requirements justify it.
- Enable spend alerts, database backups, and point-in-time recovery according
  to the actual recovery objective.
- Track MAU, database size, and egress monthly. Solves and raw save parsing do
  not use Supabase compute.
- Review Auth logs and database advisors after the first real-user beta.
- Test export, world deletion, viewer access, invitation expiry/revocation,
  concurrent edits, and sign-out in staging before production.
- Handle full account-deletion requests through the monitored privacy contact
  until an attorney-approved self-service ownership-transfer flow is added.

## AdSense

AdSense must remain disabled until all of these external gates are closed:

1. Written Pocketpair/Palworld Entertainment permission covers the actual
   ad-supported use of Pal names and data, or counsel approves the current
   neutral-avatar presentation and nominative use. Official or derived images
   require separate written permission before they are added back.
2. `ooz-wasm` and underlying `ooz` provenance is cleared, and counsel confirms
   the corresponding-source/copyleft boundary for the deployed build.
3. The privacy policy, audience/COPPA classification, and regional consent
   behavior have been reviewed for the real deployment.

After those gates are documented:

1. Create the AdSense account and add the production domain.
2. Set `VITE_ADSENSE_PUBLISHER_ID` to the full `ca-pub-################` value
   while leaving `VITE_ADSENSE_ENABLED=false`. The production build adds the
   ownership-verification meta tag and generates `/ads.txt` automatically.
3. Request site review. The domain must serve real content and be publicly
   reachable.
4. Create two responsive display units, one for Builder and one for Tools, and
   set `VITE_ADSENSE_BUILDER_SLOT` and `VITE_ADSENSE_TOOLS_SLOT`.
5. In Privacy & messaging, configure Google's CMP for the EEA, UK, and
   Switzerland and the applicable US-state messages. Test accept, reject, and
   opt-out paths by region.
6. Disable Auto ads. Palpath deliberately renders manual units only on Builder
   and Tools, away from import, Inventory, Account, Privacy, and Legal.
7. Disable user-based/personalized advertising for the initial contextual
   pilot, subject to the reviewed consent design.
8. Set `VITE_LEGAL_CONTACT_EMAIL` and an immutable, exact-release
   `VITE_SOURCE_URL`.
9. Set `VITE_ADSENSE_ENABLED=true`, deploy, and verify:
   `/ads.txt`, the `google-adsense-account` meta tag, consent flows, ad labels,
   layout stability, and the absence of ad requests on sensitive routes.
10. Start with one placement per eligible page. Add nothing until revenue,
    latency, Core Web Vitals, and policy results justify it.

Turning the flag off removes all ad script loading on the next deployment; it
does not require removing components or changing routes.
