# Privacy addendum — connected-provider responsibility

Status: operator-approved; independent review pending  
Effective date: 2026-09-03  
Decision record: `docs/architecture/ADR-013-connected-provider-responsibility.md`

## Change

The hosted beta no longer limits users to synthetic or affirmatively
non-confidential material. ROSS sends relevant prompts, documents, context, and
requests to user-selected model providers, legal sources, and connectors so
those services can perform the requested functions. Confidential or privileged
use is at the user's own risk.

Transmission to a selected service is expected and necessary. The material
privacy and professional risk is the service's subsequent handling, including
retention, model training, human review, security, disclosure, subprocessors,
and processing location under the applicable account terms and settings.

## User responsibility

Before using confidential or privileged information, the user must:

- have authority to use and disclose the information for the selected task;
- review the provider's applicable account tier, terms, privacy practices,
  retention, training, human-review, security, disclosure, and location terms;
- choose settings that meet duties of confidentiality, privilege, client
  authorization, supervision, and professional conduct; and
- continue to verify legal sources and all generated work.

ROSS does not represent that any provider or setting is suitable for a
particular client's confidential or privileged information.

## Unchanged safeguards

Verified accounts, encrypted per-user API-key storage, hosted-provider
allowlisting, raw-stream logging restrictions, metadata-only security audits,
tenant authorization, file scanning, deletion, and incident controls remain in
place. Public issues, ordinary support email, demonstrations, tests, and staging
fixtures must not contain client-confidential information.

## Review status

The independent review dated 2026-07-18 covered the former
non-confidential-only boundary. It does not approve this expansion. The website
and application must describe this addendum as operator-approved with
independent review pending.
