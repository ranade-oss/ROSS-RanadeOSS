# ROSS

**Ontario-first legal work, built in the open.**

ROSS (Ranade OSS) is an independently governed, Ontario-focused legal AI workspace for lawyers, paralegals, legal technologists, and open-source contributors. It combines document-assisted work, multiple model providers, legal-source tooling, and controlled release safeguards in a self-hostable application.

> **Public website:** [ROSS Ontario](https://ross.soundmarklaw.com)
>
> **Public-beta application:** [Launch ROSS](https://ross-ranadeoss-public.fly.dev)
>
> A verified account is required. ROSS sends relevant information to the model and connected services you choose so they can perform the functions you request. Confidential or privileged use is at your own risk; choose providers and settings that meet your professional obligations.

[Documentation](docs/) · [Architecture](docs/architecture/README.md) · [Release runbook](docs/operations/release-runbook.md) · [Report a security issue](https://github.com/ranade-oss/ROSS-RanadeOSS/security/advisories/new)

ROSS is a modified fork of [Mike](https://github.com/Open-Legal-Products/mike), licensed under AGPL-3.0. It is independently developed and is not endorsed by Mike's maintainers, governments, courts, or legal-source providers. See [NOTICE.md](NOTICE.md) for attribution and licence information.

## Start here

| Your goal | Recommended path |
| --- | --- |
| Try the hosted beta | Read [Current status](#current-status), then launch the public beta |
| Run ROSS locally | Follow [Prerequisites](#prerequisites) and [Quick start](#quick-start) |
| Understand the architecture | Review the [repository map](#repository-map) and [architecture decisions](docs/architecture/README.md) |
| Contribute a change | Read [Contributing](#contributing) and run the [verification suite](#verification) |
| Operate or release ROSS | Start with the [governance and release model](#governance-and-release-model) |
| Report a vulnerability | Use a private [GitHub Security Advisory](https://github.com/ranade-oss/ROSS-RanadeOSS/security/advisories/new) |

## Current status

ROSS is under active development. Self-hosted local development is available, and a restricted public beta is online. Production promotion remains fail-closed while required operational, legal, vendor, source-health, review, and launch approvals are incomplete.

| Area | Current status |
| --- | --- |
| Public beta | Available with verified registration |
| Hosted-beta information policy | User-selected provider responsibility; confidential or privileged use is at the user's own risk |
| Ontario legal-source coverage | Limited and reviewed, not comprehensive |
| Confidential or privileged use | User must have authority and choose suitable providers and settings |
| Production release | Blocked until governed approvals and checks pass |
| Government or court affiliation | None |

Do not use the hosted beta as a substitute for professional judgment, independent source verification, confidentiality analysis, or applicable professional obligations.

## What ROSS includes

- Document-assisted legal workspaces and conversations
- Next.js application frontend and Express API backend
- Supabase authentication and PostgreSQL persistence
- Cloudflare R2-compatible object storage
- Anthropic, Google Gemini, and OpenAI model-provider support
- Optional CourtListener tools for United States case-law lookup and citation verification
- Ontario-focused evaluation, source-health, public-content, and launch-readiness controls
- A separate governed public website in `website/`
- Deterministic release records and fail-closed production promotion checks

## Repository map

| Path | Purpose |
| --- | --- |
| `frontend/` | Next.js application |
| `backend/` | Express API, Supabase access, document processing, legal-source integrations, and database code |
| `backend/schema.sql` | Current schema for fresh Supabase databases |
| `backend/migrations/` | Dated incremental migrations for existing databases |
| `website/` | Governed public website, status, trust, coverage, and launch-readiness content |
| `config/` | Versioned branding, policy, approval, evaluation, and release-control records |
| `reports/` | Generated evaluation, source-health, completion, and release-manifest records |
| `docs/architecture/` | Architecture decisions and approval status |
| `docs/operations/` | Operational and release runbooks |
| `.github/workflows/` | Partitioned verification, synchronization, repair, and exact-head merge automation |

## Prerequisites

ROSS uses a repository-pinned toolchain:

- Node.js `>=22.13.0 <25`
- npm `11.9.0`
- git
- A Supabase project
- A Cloudflare R2 bucket, MinIO bucket, or another S3-compatible bucket
- At least one supported model-provider API key: Anthropic, Google Gemini, or OpenAI
- Optional: a CourtListener API token
- Optional: LibreOffice for DOC/DOCX-to-PDF conversion

The root `package.json` is authoritative for the supported Node.js and npm versions.

## Quick start

### 1. Install dependencies

```bash
npm run install:all
```

This installs the backend, frontend, and website workspaces using the pinned repository toolchain.

### 2. Create local environment files

```bash
touch backend/.env
touch frontend/.env.local
```

Create `backend/.env`:

```bash
PORT=3001
FRONTEND_URL=http://localhost:3000
DOWNLOAD_SIGNING_SECRET=replace-with-a-random-32-byte-hex-string
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-supabase-service-role-key

R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=ross

GEMINI_API_KEY=your-gemini-key
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
USER_API_KEYS_ENCRYPTION_SECRET=your-long-random-secret

# Optional CourtListener integration
COURTLISTENER_API_TOKEN=your-courtlistener-token
COURTLISTENER_BULK_DATA_ENABLED=false
```

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

Use the Supabase project URL, backend service-role key, and frontend anon/public key expected by the installed Supabase client libraries. Provider keys may be configured globally in `backend/.env` or, where supported, per user under **Account > Models & API Keys**.

Never commit `.env`, `.env.local`, service-role keys, provider keys, signing secrets, or client information.

### 3. Initialize the database

For a fresh database, run the contents of:

```text
backend/schema.sql
```

For an existing database, do not apply the complete schema over production data. Apply the dated files in `backend/migrations/` that are newer than the deployed version, in filename order.

### 4. Run locally

Start the backend:

```bash
npm run dev --prefix backend
```

Start the application frontend in a second terminal:

```bash
npm run dev --prefix frontend
```

Open `http://localhost:3000`, create an account, configure any required provider keys, and create or open a project.

## Verification

Run the repository-level verification suite before submitting a change:

```bash
npm run check
```

The check includes the pinned-toolchain contract, workflow-source verification, public-content generation, release-manifest checks, operations and evaluation tests, backend legal-source and security tests, dependency auditing, deterministic builds, linting, and website route tests.

Useful focused commands include:

```bash
npm run toolchain:check
npm test
npm run build
npm run lint
npm run test:website
npm run audit:high
npm run release:check
```

`npm run lint:strict` reports inherited frontend lint debt separately from the repository's non-regression gate.

## Contributing

Contributions should be narrow, reviewable, and consistent with ROSS's legal, security, and release controls.

1. Create a branch from the current `main` branch.
2. Keep application, generated-artifact, and governance changes clearly scoped.
3. Add or update tests for changed behavior.
4. Run `npm run check` before opening a pull request.
5. Describe user impact, security implications, migrations, generated files, and validation performed.
6. Do not place client information, credentials, tokens, private legal material, or vulnerability details in commits or public issues.

Security-sensitive changes and vulnerability reports must use the private reporting path described in [Security](#security).

## Governance and release model

ROSS treats verification and release state as governed repository data rather than informal deployment convention.

- Pull requests must be verified against their exact current head commit before merge.
- A successful run for an earlier commit does not verify a changed head.
- High-risk or security-sensitive application changes remain draft until human review.
- Automated repair and synchronization paths are bounded and fail closed.
- Deterministic generated artifacts must match their governed source records.
- Production promotion requires `npm run release:check` to succeed.
- A blocked release check must not be bypassed with an environment flag or by deploying an artifact different from the reviewed release manifest.

Start with:

- [Architecture decisions](docs/architecture/README.md)
- [Release runbook](docs/operations/release-runbook.md)
- [Launch checklist](docs/operations/launch-checklist.md)
- [`config/release-approvals.v1.json`](config/release-approvals.v1.json)
- [`config/operations-readiness.v1.json`](config/operations-readiness.v1.json)
- [`config/launch-readiness.v1.json`](config/launch-readiness.v1.json)
- [`reports/release-manifest-v1.json`](reports/release-manifest-v1.json)

## CourtListener integration

With a valid `COURTLISTENER_API_TOKEN`, ROSS can use CourtListener for United States case-law citation verification, case retrieval, targeted opinion search, and case-law panels in assistant responses.

Existing deployments must apply the corresponding dated database migration before enabling the integration. Optional bulk-data mode reads citation and cluster metadata from Supabase and cached opinion JSON from R2 before falling back to the live CourtListener API.

ROSS does not authorize CanLII scraping. Ontario source integrations must comply with applicable access terms, technical controls, and repository governance records.

## Troubleshooting

**Sign-up confirmation email does not arrive.** Confirmation email is handled by Supabase Auth. For local development, email confirmation may be disabled under **Supabase > Authentication > Providers > Email**. For an operated deployment, configure appropriate SMTP rather than relying on Supabase's limited built-in mailer.

**The model picker reports a missing key.** Add the provider key under **Account > Models & API Keys**, or configure it in `backend/.env` and restart the backend.

**CourtListener reports a missing token.** Configure `COURTLISTENER_API_TOKEN` globally or add a supported per-user token, then restart the backend after changing `.env`.

**DOC or DOCX conversion fails.** Install LibreOffice and restart the backend so its conversion commands are available on the process path.

**Toolchain verification fails.** Confirm that Node.js and npm match the exact versions declared in the root `package.json`.

## Security

Please report vulnerabilities privately through [GitHub Security Advisories](https://github.com/ranade-oss/ROSS-RanadeOSS/security/advisories/new). Do not disclose confidential client information, credentials, tokens, or exploitable vulnerability details in a public issue.

## Attribution and licence

ROSS is a modified fork of Mike and is licensed under [AGPL-3.0](LICENSE). Upstream source and website:

- [Open Legal Products / Mike](https://github.com/Open-Legal-Products/mike)
- [Mike website](https://mikeoss.com)

See [NOTICE.md](NOTICE.md) for complete attribution and licence notices.
