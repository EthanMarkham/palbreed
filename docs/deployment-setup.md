# Production setup: Supabase

The application remains fully local when no environment variables are set.
Supabase is optional. Never put a Supabase service-role key or OAuth client
secret in a `VITE_` variable; every `VITE_` value is public browser
configuration.

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
3. Enable email magic links for the initial launch. They are the default and
   avoid a third-party OAuth dependency. Google, GitHub, and Discord can be
   selected later through `VITE_SUPABASE_AUTH_METHOD`.
4. In the selected provider's developer console, use Supabase's callback URL:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Put the provider client ID and secret only in Supabase's provider settings.
6. Leave anonymous sign-ins disabled. Leave email/password sign-in disabled
   until custom SMTP, recovery, and abuse controls are intentionally added.

### Switch from email magic links to Google OAuth

1. In Google Cloud Console, configure the OAuth consent screen and create a Web
   application OAuth client.
2. Add the production site origin and `http://localhost:5173` as authorized
   JavaScript origins.
3. Add `https://<project-ref>.supabase.co/auth/v1/callback` as the authorized
   redirect URI. This is the Supabase callback, not the Vercel account URL.
4. In Supabase Dashboard > Authentication > Sign In / Providers > Google, enable
   Google and store the Google client ID and secret there. Never put the secret
   in Vercel or a `VITE_` variable.
5. Set `VITE_SUPABASE_AUTH_METHOD=google` in Vercel Production and Preview,
   redeploy, then test sign-in and an invitation-return URL.

### 3. Configure deployment variables

Copy `.env.example` into the host's environment settings and set:

- `VITE_SUPABASE_URL`: Project URL from Project Settings > API.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the publishable key. A legacy anon key also
  works, but use the current publishable key for a new project.
- `VITE_SUPABASE_AUTH_METHOD`: `email` (the default; `google`, `discord`, and
  `github` remain supported).
- `VITE_LEGAL_CONTACT_EMAIL`: monitored privacy/deletion contact.
- `VITE_SOURCE_URL`: HTTPS URL for the exact deployed corresponding-source
  release, including application source, WASM interface code, build scripts,
  and lockfiles.

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
