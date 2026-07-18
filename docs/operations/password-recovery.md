# ROSS password recovery

ROSS uses Supabase Auth's two-step password-recovery flow:

1. `/forgot-password` calls `resetPasswordForEmail()` and requests a
   time-limited email link.
2. `/reset-password` establishes the recovery session and calls `updateUser()`
   after the user chooses a new password.

## Required hosted configuration

In the Supabase project used by the deployment, configure **Authentication >
URL Configuration** with:

- Site URL: `https://ross-ranadeoss-private.fly.dev`
- Redirect URL:
  `https://ross-ranadeoss-private.fly.dev/reset-password`

The production deployment must use its own exact origin. Do not add broad
wildcards for production password-recovery redirects.

The GitHub deployment environment must use the Supabase project origin, such
as `https://project-ref.supabase.co`, for `ROSS_SUPABASE_URL`. Do not use a
dashboard URL or append `/auth/v1`, `/rest/v1`, or another API path. The
publishable and secret keys must both come from that same project. The private
deployment validates the origin and both key/project pairings before it changes
the Fly applications.

Password recovery also requires working authentication-email delivery. The
Supabase default email service is suitable only for limited testing; configure
and validate production SMTP before approving a public beta.

## Validation

Use a synthetic test account or the owner's account without disclosing the
address, password, token, or recovery URL in retained evidence.

1. Request recovery for a known account and confirm that the UI returns the
   same privacy-preserving status used for an unknown address.
2. Confirm that the email link opens `/reset-password` on the exact deployment.
3. Confirm that an expired or reused link is rejected.
4. Confirm that a password shorter than 12 characters and a mismatched
   confirmation are rejected.
5. Set a new password, confirm the recovery session is signed out locally, and
   sign in again with the new password.
6. Confirm the previous password no longer works.
7. Retain only timestamps and pass/fail results. Never retain the password,
   token, recovery URL, or email contents containing the link.

Password recovery does not replace the separate requirement that the API
validate the refreshed Supabase access token. A persistent `401 Invalid or
expired token` after a fresh login indicates deployment configuration, usually
an incorrect `ROSS_SUPABASE_SECRET_KEY`, rather than a password-recovery
failure.
