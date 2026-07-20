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
   `supabase db push`. The migrations in `supabase/migrations` create the
   Builder search-history model and its server-side functions.
3. Run `supabase test db`. The pgTAP suite verifies anonymous search isolation,
   canonical search deduplication, and the denial of direct browser writes.
4. Keep separate Supabase projects for preview/staging and production. Never
   point pull-request previews at production data.

### 2. Configure authentication

Email magic links remain available whenever Supabase is configured. To also
offer Google sign-in:

1. Create a Google OAuth client for a Web application.
2. Add the production origin and local development origin to Google's
   authorized JavaScript origins.
3. Add `https://<project-ref>.supabase.co/auth/v1/callback` to Google's
   authorized redirect URIs.
4. Enable Google in Supabase Dashboard > Authentication > Sign In / Providers
   and store the client ID and secret there. Do not put the secret in Vercel.
5. Set `VITE_SUPABASE_AUTH_METHOD=google` and redeploy.

The repository intentionally does not manage hosted Google credentials in
`supabase/config.toml`; the Supabase Dashboard remains authoritative for that
provider.

### 3. Configure deployment variables

Copy `.env.example` into the host's environment settings and set:

- `VITE_SUPABASE_URL`: Project URL from Project Settings > API.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the publishable key. A legacy anon key also
  works, but use the current publishable key for a new project.
- `VITE_SUPABASE_AUTH_METHOD`: `google` to show Google OAuth and email magic
  links, or `email` for email-only sign-in.
- `VITE_LEGAL_CONTACT_EMAIL`: monitored privacy/deletion contact.
- `VITE_SOURCE_URL`: HTTPS URL for the exact deployed corresponding-source
  release, including application source, WASM interface code, build scripts,
  and lockfiles.

### 4. Production controls

- Upgrade from Free only when usage requirements justify it.
- Enable spend alerts, database backups, and point-in-time recovery according
  to the actual recovery objective.
- Track database size, Builder search RPC volume, and egress monthly.
  Solves and raw save parsing do not use Supabase compute.
- Review database advisors after the first real-user beta.
- Test search-history isolation, deletion, and retention in staging before production.
