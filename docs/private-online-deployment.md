# Private online ROSS deployment

This runbook deploys the authenticated ROSS application and API to Fly.io in
Toronto (`yyz`). Supabase provides authentication, PostgreSQL, and private
S3-compatible document storage in Canada Central. It is a controlled beta for
the owner account only; new registrations remain disabled.

## Safety boundary

- The Fly workflow is manual and never runs merely because code is merged.
- No credential is committed to the repository.
- Supabase's secret/service-role key and S3 credentials are server-side only.
- The S3 bucket is private and named `ross-private-files`.
- Every application route requires Supabase authentication; `/health` exposes
  only non-sensitive service status.
- The controlled beta accepts synthetic and non-confidential test material
  only. Do not upload client, privileged, or otherwise confidential records.

## One-time GitHub configuration

In GitHub, open **Settings → Secrets and variables → Actions** and create the
following repository secrets:

| Secret                          | Source                                    |
| ------------------------------- | ----------------------------------------- |
| `FLY_API_TOKEN`                 | Fly.io user access token                  |
| `ROSS_SUPABASE_URL`             | Supabase project URL                      |
| `ROSS_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key                  |
| `ROSS_SUPABASE_SECRET_KEY`      | Supabase secret/service-role key          |
| `ROSS_S3_ENDPOINT_URL`          | Supabase Storage S3 endpoint              |
| `ROSS_S3_REGION`                | Region shown by Supabase S3 configuration |
| `ROSS_S3_ACCESS_KEY_ID`         | Generated S3 access key ID                |
| `ROSS_S3_SECRET_ACCESS_KEY`     | Generated S3 secret access key            |

Never paste these values into an issue, pull request, workflow input, source
file, or chat. GitHub masks repository secrets in action logs.

Create a GitHub Actions environment named `private-online`. It may optionally
require the repository owner to approve each deployment.

## Deploy

1. Open **Actions → Deploy private ROSS → Run workflow**.
2. Enter the organization slug shown in the Fly.io dashboard.
3. Keep the suggested application names unless Fly reports that a name is
   already in use. Names must be globally unique.
4. Run the workflow and wait for both health checks to pass.

The workflow creates one auto-stopping 1 GB shared-CPU Machine for the frontend
and one for the API. It generates stable download, API-key encryption, and MCP
connector encryption secrets directly in Fly.io on the first run and preserves
them on later deployments.

## Complete Supabase URL configuration

After the first successful deploy, copy the website URL from the GitHub Actions
summary. In Supabase **Authentication → URL Configuration**:

1. Set **Site URL** to the Fly website URL.
2. Add `<Fly website URL>/**` to **Redirect URLs**.
3. Confirm new user sign-ups remain disabled.

## First login verification

1. Open the `/login` URL from the workflow summary.
2. Sign in with the manually created owner account.
3. Confirm `/signup` reports that registrations are unavailable.
4. Accept the controlled-beta boundary using synthetic/non-confidential data.
5. Add an OpenAI API key under **Account → API Keys** if model features are to
   be exercised. The backend encrypts this key before storing it.
6. Upload a synthetic document, download it, then delete it to verify private
   storage end to end.
