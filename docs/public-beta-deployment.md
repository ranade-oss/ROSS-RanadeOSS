# Public ROSS beta deployment

Deliverable G adds a separate, manual public-beta deployment path. It does not
alter the owner-only workflow and it does not bypass Deliverable F's final gate.
The owner-only workflow may complete with a prominent source-coverage warning
after both services deploy; the public-beta workflow keeps source verification
blocking.

## Product boundary

- Anyone may register an individual account through the public sign-up page.
- Email confirmation is mandatory and the API rejects unconfirmed accounts.
- Uploads and AI requests remain authenticated; there is no anonymous mode.
- Users bring their own supported model-provider key. Existing encrypted BYOK
  storage and account export/deletion remain available.
- The operator-hosted beta accepts only synthetic or affirmatively
  non-confidential material. Self-hosted operators set and document their own
  approved data boundary.
- Public search indexing and confidential or privileged hosted use remain
  outside this approval.

## One-time Supabase preparation

1. Run `backend/migrations/20260717_02_public_beta_registration.sql` in the SQL
   editor. The migration adds versioned terms/privacy evidence to
   `user_profiles`, preserves RLS, and keeps browser table grants revoked.
2. In **Authentication → Providers → Email**, enable email sign-up and enable
   **Confirm email**.
3. In **Authentication → URL Configuration**, set the Fly application URL as
   the Site URL and add `https://YOUR-WEB-APP.fly.dev/**` to Redirect URLs.
4. Configure Supabase authentication rate limits and email delivery for the
   expected beta volume. Do not use a personal mailbox as the production sender.
5. Test registration, duplicate registration, confirmation, login, password
   reset, account deletion, and a rejected unconfirmed API session.

## GitHub environment

Create a `public-beta` GitHub environment. Require an owner approval and keep
the same eight deployment secrets used by the owner-only Fly deployment. Limit
environment deployment branches to `main`.

## Release and deploy

1. Complete the work in `docs/final/owner-action-sheet.md` for one immutable
   release candidate.
2. Run the **Final controlled-beta evidence** workflow and retain its artifact.
3. Open **Actions → Deploy public ROSS beta → Run workflow** on that exact
   commit.
4. Enter the matching release ID and Fly organization/app names.
5. Confirm the Supabase auth configuration and recorded go-live approval.
6. The workflow re-runs `npm run final:check`; any incomplete or mismatched
   evidence stops deployment.

## Post-deploy verification

- Register a new non-owner email and confirm that no session can use the API
  before the email link is opened.
- Confirm both policy checkboxes and the data-boundary gate are required.
- Add a test BYO model-provider key and run a synthetic prompt.
- Confirm a second account cannot see the first account's projects or files.
- Exercise download, export, deletion, throttling, rollback, and incident
  procedures; retain only non-secret evidence.
- Monitor authentication abuse, API limits, storage growth, source health,
  errors, support, and cost before expanding the beta.

## Rollback

Use the documented Fly rollback procedure for application or API defects. To
pause new registrations without removing existing users, redeploy the
owner-only workflow (which builds with `NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED=false`)
and disable new email sign-ups in Supabase. Do not delete user data as a
rollback mechanism.
