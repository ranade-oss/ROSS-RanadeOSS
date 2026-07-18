# ROSS privacy impact assessment — public controlled beta

Status: independent privacy expert approved the stated controlled-beta boundary

Assessment date: 2026-07-18
Decision: retain the synthetic/non-confidential controlled-beta boundary

## Purpose and necessity

ROSS assists Ontario legal professionals with document work and source-grounded legal research. During beta, personal or confidential client information is not necessary to test the system. Synthetic or affirmatively non-confidential material is the proportionate input class.

The Office of the Privacy Commissioner of Canada recommends using anonymized, synthetic, or de-identified data when personal information is unnecessary and recommends privacy-impact assessments for generative AI. The Law Society of Ontario connects technological competence with understanding technology risks and protecting confidential information. These sources support the conservative beta boundary; they do not decide which statute applies to a future operator.

## Applicability requiring legal determination

Abhi Ranade is the recorded legal operator. Applicable privacy law remains fact-specific; the operator must continue to account for PIPEDA, provincial privacy statutes, professional duties, contractual confidentiality, public-sector requirements, and, before any health-data use, PHIPA.

## Collection and data minimization

Beta collection is limited to account/authentication data needed to operate access, user configuration, synthetic/non-confidential content, legal-source requests/results, and metadata needed for security and reliability. ROSS does not intentionally collect real client documents, privileged prompts, sensitive support content, or analytics events during this mode.

## Use, disclosure, and transfers

Application content may be sent to the configured model provider and, when explicitly invoked, legal-source or connector providers. The hosted model allowlist is OpenAI. CanLII and CourtListener keys are optional, encrypted per-user credentials; ROSS supplies no shared legal-source access. The effective subprocessor inventory identifies the launch vendors and makes user-directed and cross-border processing explicit.

## Safeguards implemented and reviewed

- Versioned acknowledgement in the authenticated application and API enforcement on content-bearing writes.
- Fail-closed hosted-mode and model-provider configuration.
- Raw model-stream logging prohibited outside local development.
- Metadata-only service audit records with browser roles revoked.
- Prompt-injection and matter-scope instructions.
- Existing authentication, MFA support, exact CORS, security headers, rate limits, encrypted user API-key storage, export, and deletion features preserved.
- Private quarantine, malware scanning, clean-object promotion, signed downloads, and security-alert delivery were exercised against the exact base deployment.
- Independent security and accessibility reports were approved on 2026-07-18 with no unresolved Critical or High findings; the references are retained in the controlled-beta owner approval record.

## Residual risks and decisions

- Attestation cannot determine whether content is actually non-confidential.
- The legal operator, support/privacy contact, Supabase Free tier and Canada Central region, Supabase Storage S3 endpoint, Fly Toronto application region, status location, and retention schedule are owner decisions recorded on 2026-07-18.
- The isolated database, Storage, tenant-boundary, and authentication-recovery exercise passed on 2026-07-18 and the target was destroyed. Supabase Free nevertheless has no automatic daily database backup, Storage has no S3 object versioning, and deleted objects cannot be restored. Users must retain local copies.
- Provider-native email, website, support, security, source, connector, and user-directed model processing may occur outside Canada under provider terms.
- The CanLII metadata transport is not activated and the public beta must not imply full-text or comprehensive CanLII access.
- No production service may accept client material under this assessment.

## Official reference points

- Law Society of Ontario, Rules of Professional Conduct: https://lso.ca/about-lso/legislation-rules/rules-of-professional-conduct/complete-rules-of-professional-conduct
- OPC, PIPEDA requirements in brief: https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/
- OPC, responsible generative-AI principles: https://www.priv.gc.ca/en/privacy-topics/technology/artificial-intelligence/gd_principles_ai/
- OPC, breach reporting and recordkeeping: https://www.priv.gc.ca/en/privacy-topics/business-privacy/breaches-and-safeguards/privacy-breaches-at-your-business/gd_pb_201810/
- Ontario IPC/OHRC, responsible-use principles for AI: https://www.ipc.on.ca/en/resources/principles-responsible-use-artificial-intelligence
