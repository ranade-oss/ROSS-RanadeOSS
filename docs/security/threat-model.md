# ROSS controlled-beta threat model

Status: operator-approved policy update; independent security and privacy review pending  
Scope: public-registration hosted beta using verified individual accounts and user-selected connected services  
Last engineering review: 2026-09-03  
Owner: Abhi Ranade; independent reviewers for this policy change not yet assigned

## Protected assets and trust boundaries

ROSS handles account identifiers, authentication sessions, user-supplied API keys, prompts and files, generated work, project and sharing metadata, legal-source responses, connector credentials, and operational/security metadata. Boundaries exist between the browser, API, authentication/database service, object storage, document converter, model providers, legal-source providers, MCP connectors, email provider, logs, backups, and administrators.

ROSS sends relevant information across these boundaries when a user selects a model, source, or connector. That transmission is necessary for the selected function. Confidential or privileged use is at the user's own risk. The acknowledgement gate records that the user accepts responsibility for provider selection and settings; it does not classify content, guarantee privilege protection, or establish that a provider is suitable.

## Principal threats and implemented controls

| Threat | Current control | Residual risk / required follow-up |
| --- | --- | --- |
| Provider handles information contrary to the user's expectations or duties | Versioned acknowledgement, provider-specific keys, hosted allowlist, public disclosure, and user responsibility for provider terms and settings | Terms, account tier, retention, training, human review, security, disclosure, subprocessors, and location vary; independent review of this expanded policy is pending |
| Cross-user or cross-matter access | Authenticated routes, existing ownership checks/RLS, scoped document tools | Full IDOR/RLS matrix and independent penetration test remain required |
| Prompt injection in uploads or sources | System instruction treats all document/source/connector text as untrusted and forbids scope expansion | Adversarial evaluation and tool-level authorization tests remain required |
| Secret or content leakage through logs | Production/staging startup rejects raw model-stream logging; audit metadata is allowlisted | Existing log call sites require continuing review; infrastructure log access and retention are not selected |
| Unapproved model provider | Hosted provider allowlist enforced at the model adapter | Product/tier/region/retention contractual approval remains external |
| Credential compromise | Server-only service keys, inherited encrypted user-key storage, MFA support, redaction of common key patterns | Privileged-account MFA enforcement and key rotation exercise remain required |
| Malicious files/conversion | Existing type/size validation and isolated service boundary in the target topology | Malware scanning, conversion sandbox verification, resource limits, and penetration testing remain required |
| Unsafe sharing/export | Existing server authorization and rate limits; metadata-only audit table foundation | Complete audit hooks and sharing/export IDOR tests remain required |
| Source poisoning or stale law | Official/allowlisted sources, provider metadata, source hashes/checks, visible verification states | Human stale-source response and comprehensive citator coverage remain incomplete |
| Availability or abuse | Helmet, exact CORS, bounded payloads, route-specific rate limits, fail-closed source policy, release/rollback/restore runbooks | Distributed limiter, WAF, monitoring, backups, restore and failover still require selected infrastructure and exercised evidence |
| Automated registration or credential attacks | Hosted API requires confirmed email; Supabase auth limits and email confirmation are required; application content routes require authentication | CAPTCHA, reputation controls, distributed throttling, suspension tooling, and alert thresholds require live-environment review |

## Abuse cases

- A document tells the model to ignore system rules, reveal credentials, or retrieve another matter.
- An authenticated user changes a document/project/workflow identifier to another user’s object.
- A user uploads a decompression bomb, malformed office file, malware, or oversized file.
- A connector returns instructions or content designed to trigger unrelated tool calls.
- A source page changes format, redirects to an unapproved host, or supplies an invented citation.
- A developer enables raw stream logging or production mode with placeholder controls.

## Release blockers

ADR-013 records the operator's decision to allow confidential or privileged use at the user's own risk. ROSS must not claim that any provider is suitable for such use. A later claim that ROSS or a provider is approved, secure, privilege-preserving, zero-retention, or suitable for a defined confidential-data class remains blocked until the applicable terms, configuration, contracts, residency, retention, deletion, incident process, tenant tests, and independent privacy/security review support that claim.
