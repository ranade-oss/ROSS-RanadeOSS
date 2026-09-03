# ADR-013 — Connected-provider responsibility and confidential use

- Status: Accepted
- Date: 2026-09-03
- Owner: Abhi Ranade, legal operator and product owner
- Independent review: Pending for the changed policy
- Supersedes: ADR-002 and the data-classification part of ADR-001
- Review trigger: A provider, hosting, retention, training, disclosure, or professional-obligation change

## Context

ROSS must send relevant prompts, documents, context, and requests to a model,
legal source, or other connected service for that service to perform the
function selected by the user. Transmission is expected behaviour, not itself a
misuse of information.

The important risk is what a selected service may do after receiving the
information. Provider terms, account tier, retention, model training, human
review, security, disclosure, subprocessors, and processing location can vary.
ROSS cannot decide whether a particular provider or configuration satisfies a
lawyer's or paralegal's obligations in a particular matter.

## Decision

The operator-hosted beta no longer imposes a blanket rule limiting use to
synthetic or affirmatively non-confidential material.

ROSS will instead:

1. Explain that it sends relevant information to the services the user chooses
   so those services can perform the requested function.
2. State that confidential or privileged use is at the user's own risk.
3. Require a versioned acknowledgement before content-bearing requests.
4. Tell users to review each provider's applicable terms, privacy practices,
   retention, training, human-review, security, disclosure, subprocessors, and
   processing locations.
5. Make users responsible for having authority to use the information and for
   choosing providers and settings that meet duties of confidentiality,
   privilege, client authorization, supervision, and professional conduct.
6. Avoid claiming that ROSS or any listed provider is suitable for confidential
   or privileged work.

This change does not authorize misuse, unauthorized disclosure, evasion of
professional duties, or use contrary to a provider's terms. Support email,
public issues, demonstrations, tests, and staging fixtures continue to exclude
client-confidential information because those channels are not the user's
selected legal-work provider path.

## Implementation

- The acknowledgement value is `provider-responsibility-acknowledged`.
- The policy version is `2026-09-03-provider-responsibility`.
- Existing acknowledgements do not satisfy the new version; users must
  acknowledge the changed policy.
- The backend continues to reject content-bearing requests without the current
  acknowledgement.
- ROSS continues to prohibit raw model-stream logging outside local
  development, restrict hosted providers through configuration, encrypt stored
  user API keys, and require verified accounts.

## Consequences

- Users can choose to work with confidential or privileged information, but
  ROSS does not decide whether that choice is professionally or legally proper.
- Provider selection and configuration become a central onboarding and
  continuing-review obligation.
- The website, application, privacy notice, terms, acceptable-use rules,
  threat model, deployment configuration, and release probes must use the same
  policy version and explanation.
- The earlier independent privacy and security reviews covered the former
  non-confidential-only boundary. Independent review of this expanded policy is
  pending and must not be represented as complete.
- Historical release records remain unchanged as evidence of the policy that
  applied when they were created.
