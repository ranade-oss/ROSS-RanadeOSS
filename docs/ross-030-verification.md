# ROSS-030 authenticated application rebrand verification

Date: 2026-07-16

Branch: `agent/ross-030-authenticated-app-rebrand`

## Scope

ROSS-030 replaces user-facing Mike identity in the inherited authenticated
Next.js application with the approved ROSS identity. It does not change routes,
API endpoints, database tables, authentication, authorization, document
storage, legal-source providers, model providers, workflows, or application
data.

## Included

- ROSS metadata, favicon, application logo, status icon, social card, sidebar,
  sign-up links, support copy, account copy, export filenames, MFA device names,
  prompts, and error-page title.
- Central product configuration integration for the application name, URLs,
  beta statement, terms, and privacy links.
- An explicit CourtListener description as an optional inherited U.S. provider;
  no Ontario source integration is claimed to be live.
- Upstream Mike workflow attribution and links remain visible where the app
  still integrates with `Open-Legal-Products/mike-workflows`.

## Deliberately preserved compatibility identifiers

The following inherited internal identifiers remain unchanged because renaming
them could invalidate existing browser state, drag-and-drop contracts, events,
or imports:

- `mike.selectedModel`
- `mike:mfa-verified-at`
- `mike:close-row-actions`
- `application/mike-doc`
- `application/mike-folder`
- `mikeApi.ts` and its existing imports
- `mike-icon.tsx` as a compatibility re-export of the new `RossIcon`

These identifiers are not presented as product branding.

## Verification result

| Check | Result | Notes |
|---|---|---|
| ROSS branding contracts | Pass | 5 ROSS-030 contracts pass within the 23-test baseline suite |
| Authenticated frontend production build | Pass | Next.js production build completed; all inherited application routes remain present |
| Preserved repository baseline | Pass | 23/23 baseline tests pass; inherited lint ceiling remains 25 errors and 42 warnings |
| Full repository gate | Pass | Backend, authenticated frontend, public website, lint, and website route tests pass via `npm run check` |
| GitHub Actions | Pending | Runs after browser upload and pull-request creation |

## Boundaries

- This package does not enable Ontario legal-source integrations.
- Placeholder `.invalid` URLs remain production blockers.
- No hosted authenticated application, authentication configuration, or real
  user data is created by this package.
