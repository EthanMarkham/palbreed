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

### 2. Configure deployment variables

Copy `.env.example` into the host's environment settings and set:

- `VITE_SUPABASE_URL`: Project URL from Project Settings > API.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the publishable key. A legacy anon key also
  works, but use the current publishable key for a new project.
- `VITE_LEGAL_CONTACT_EMAIL`: monitored privacy/deletion contact.
- `VITE_SOURCE_URL`: HTTPS URL for the exact deployed corresponding-source
  release, including application source, WASM interface code, build scripts,
  and lockfiles.

### 3. Production controls

- Upgrade from Free only when usage requirements justify it.
- Enable spend alerts, database backups, and point-in-time recovery according
  to the actual recovery objective.
- Track database size, Builder search RPC volume, and egress monthly.
  Solves and raw save parsing do not use Supabase compute.
- Review database advisors after the first real-user beta.
- Test search-history isolation, deletion, and retention in staging before production.
