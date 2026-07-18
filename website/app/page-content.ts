export type PublicPage = {
  title: string;
  eyebrow: string;
  summary: string;
  status: string;
  sections: { title: string; body: string }[];
  governance: {
    owner: string;
    reviewer: string | null;
    reviewStatus:
      | "engineering-reviewed"
      | "independent-reviewed"
      | "independent-review-required";
    effectiveDate: string | null;
    lastReviewedDate: string | null;
    nextReviewDate: string;
  };
};

const engineeringReviewed = (owner: string): PublicPage["governance"] => ({
  owner,
  reviewer: "ROSS engineering review",
  reviewStatus: "engineering-reviewed",
  effectiveDate: "2026-07-16",
  lastReviewedDate: "2026-07-16",
  nextReviewDate: "2026-08-16",
});

const independentReviewRequired = (
  owner: string,
): PublicPage["governance"] => ({
  owner,
  reviewer: null,
  reviewStatus: "independent-review-required",
  effectiveDate: null,
  lastReviewedDate: null,
  nextReviewDate: "2026-08-16",
});

const independentlyReviewed = (
  owner: string,
  reviewer: string,
): PublicPage["governance"] => ({
  owner,
  reviewer,
  reviewStatus: "independent-reviewed",
  effectiveDate: "2026-07-18",
  lastReviewedDate: "2026-07-18",
  nextReviewDate: "2026-08-16",
});

const independentlyReviewedPendingEffect = (
  owner: string,
  reviewer: string,
): PublicPage["governance"] => ({
  owner,
  reviewer,
  reviewStatus: "independent-reviewed",
  effectiveDate: null,
  lastReviewedDate: "2026-07-18",
  nextReviewDate: "2026-08-16",
});

export const publicPages: Record<string, PublicPage> = {
  ontario: {
    title: "Ontario and Canadian capability",
    eyebrow: "Jurisdiction plan",
    summary:
      "ROSS adds an Ontario-first, provider-neutral research foundation without removing inherited optional U.S. research.",
    status:
      "The Ontario workflows and benchmark have legal-content approval for the controlled beta; live availability and comprehensive source coverage are not claimed.",
    governance: independentlyReviewed(
      "Legal-content owner — AR",
      "Independent Ontario lawyer; evidence retained by AR",
    ),
    sections: [
      {
        title: "Implemented foundation",
        body: "Provider-neutral records separate jurisdiction, court, authority level, document type, source version, provider, canonical URL, retrieval time, and verification state.",
      },
      {
        title: "Authorized sources",
        body: "The implemented connectors use A2AJ, official government sources, and optional per-user CourtListener access. Users may store their own authorized CanLII API key for the governed metadata connector; ROSS supplies no shared key and does not scrape CanLII.",
      },
      {
        title: "Visible gaps",
        body: "Coverage for ONSC, ONCJ, Small Claims Court, tribunals, historical material, noting-up, and source currency must be measured and displayed before being represented as supported.",
      },
    ],
  },
  features: {
    title: "A complete legal workspace",
    eyebrow: "Preserved Mike capabilities",
    summary:
      "ROSS keeps the inherited assistant, project, document, tabular-review, workflow, sharing, connector, and self-hosting surfaces under regression protection.",
    status:
      "Inherited capability preservation is automated; end-to-end product coverage remains incomplete.",
    governance: engineeringReviewed("ROSS product maintainers"),
    sections: [
      {
        title: "Work with matters and documents",
        body: "Organize projects, upload and preview documents, draft and edit, track document versions, and export generated work.",
      },
      {
        title: "Structured review",
        body: "Use assistant workflows, reusable workflows, and tabular review while retaining citations and matter context.",
      },
      {
        title: "Deploy on your terms",
        body: "The AGPL codebase supports self-hosting. Each deployer remains responsible for security, privacy, providers, storage, legal content, backups, and operations.",
      },
    ],
  },
  workflows: {
    title: "Ontario workflow catalogue",
    eyebrow: "Public catalogue",
    summary:
      "Five versioned Ontario workflows are approved for the controlled-beta boundary while the inherited Mike workflow library remains intact.",
    status:
      "Ontario-lawyer review and independent adjudication are recorded; use remains limited to synthetic or affirmatively non-confidential material.",
    governance: independentlyReviewed(
      "Ontario workflow owner — AR",
      "Independent Ontario lawyer; evidence retained by AR",
    ),
    sections: [
      {
        title: "Catalogue requirements",
        body: "Each workflow states jurisdiction, practice area, version, intended user, required inputs, primary sources, exclusions, review checklist, and synthetic benchmark fixture.",
      },
      {
        title: "Current availability",
        body: "Catalogue entries can be inspected publicly and opened in the authenticated application. They remain limited to synthetic or affirmatively non-confidential material throughout the controlled beta.",
      },
    ],
  },
  coverage: {
    title: "Source coverage",
    eyebrow: "Generated source registry",
    summary:
      "Coverage must describe what ROSS can retrieve and verify without implying completeness, official status, or currentness that the evidence does not support.",
    status:
      "Generated from the implemented provider registry; runtime health and comprehensive coverage remain unverified.",
    governance: independentReviewRequired(
      "Legal-content and technical owners — unassigned",
    ),
    sections: [
      {
        title: "Decisions",
        body: "A2AJ is implemented for Canadian decision discovery and unofficial text, subject to its runtime-reported datasets and availability. CourtListener and CanLII credentials are optional and supplied separately by each authorized user. The CanLII boundary is metadata-only and never represents full-text or comprehensive access.",
      },
      {
        title: "Legislation",
        body: "Ontario e-Laws and federal Justice Laws connectors are implemented with source, currency, consolidation, amendment, canonical-link, and reproduction metadata. Historical-version retrieval is explicitly limited.",
      },
      {
        title: "Decisions and noting-up",
        body: "Decision availability and citator coverage vary by court and provider. Missing coverage must be explicit, and noting-up must never be inferred from ordinary search results.",
      },
    ],
  },
  "open-source": {
    title: "Open source and self-hosting",
    eyebrow: "AGPL-3.0",
    summary:
      "ROSS is an independently developed modified fork of Mike. Its source and architecture decisions are public.",
    status:
      "Self-hosting documentation and production runbooks remain in development.",
    governance: independentReviewRequired("Release owner — unassigned"),
    sections: [
      {
        title: "Corresponding source",
        body: "Every ROSS network deployment must provide a working link to the corresponding source and preserve applicable copyright and licence notices.",
      },
      {
        title: "Deployment responsibility",
        body: "Self-hosters choose and operate authentication, database, storage, model providers, email, conversion, monitoring, backups, retention, and incident response.",
      },
      {
        title: "Upstream attribution",
        body: "ROSS preserves Mike functionality and credits the upstream project without implying endorsement or affiliation.",
      },
    ],
  },
  security: {
    title: "Security",
    eyebrow: "Controls before claims",
    summary:
      "ROSS is not yet approved for real confidential or privileged client material in an operator-hosted service.",
    status:
      "Independent security and privacy reviews are approved with no unresolved Critical or High findings; production operator and vendor decisions remain open.",
    governance: independentlyReviewed(
      "Security owner — AR",
      "Security reviewer report; approval evidence retained by AR",
    ),
    sections: [
      {
        title: "Current beta boundary",
        body: "Development, demos, previews, and hosted beta use synthetic or non-confidential materials only. This applies to documents, prompts, logs, screenshots, support, and analytics.",
      },
      {
        title: "Architecture direction",
        body: "The hosted route uses a Supabase Free project in ca-central, Fly application/API/worker services in Toronto, a separately configured private S3-compatible object store, user-supplied OpenAI keys, conversion, and account email. The object-store endpoint and remaining provider terms still require verification.",
      },
      {
        title: "Report safely",
        body: "Do not open public vulnerability details. Private GitHub vulnerability reporting is the current security channel.",
      },
    ],
  },
  privacy: {
    title: "Privacy notice — controlled-beta draft",
    eyebrow: "Independent privacy review completed",
    summary:
      "The public site does not intentionally collect form submissions, run product analytics, authenticate visitors, or load application data; hosting-level request records may still be processed.",
    status:
      "Independent privacy review is approved. Abhi Ranade is the operator and abhi@soundmarklaw.com is the privacy contact. Final storage-provider verification and complete vendor disclosures are still required before this notice can take effect.",
    governance: independentlyReviewedPendingEffect(
      "Legal operator — Abhi Ranade; privacy evidence retained by AR",
      "Independent privacy expert; evidence retained by AR",
    ),
    sections: [
      {
        title: "Public website",
        body: "The site serves public content only and has no first-party form or analytics integration. Its hosting service may process network identifiers, request metadata, security events, and necessary cookies or tokens; the effective notice must publish the actual hosting terms, purposes, locations, access, and retention.",
      },
      {
        title: "Hosted application",
        body: "The public-registration hosted application is restricted to verified individual accounts and synthetic or affirmatively non-confidential material. It may process account, configuration, project, prompt, file, generated-content, source-query, connector, security, and support data as described in the engineering inventory. No real client or privileged material is approved.",
      },
      {
        title: "Choices, access, and deletion",
        body: "The application includes account export, content deletion, and account deletion surfaces. Privacy questions, complaints, and deletion requests may be sent to abhi@soundmarklaw.com. Applicable legal rights, verification steps, response periods, and appeals remain subject to the effective notice and governing law.",
      },
      {
        title: "Retention and disclosure",
        body: "The approved target removes active and quarantine document objects within 24 hours of deletion or terminal scan failure and expires encrypted recovery copies within seven days. The actual object-store endpoint, enforcement, provider retention, lawful disclosure, cross-border processing, and contract terms still require verification before the notice becomes effective.",
      },
    ],
  },
  terms: {
    title: "Hosted-service terms — legal draft",
    eyebrow: "Legal review required",
    summary:
      "No hosted-service terms have been approved and this page does not create a production service offering.",
    status:
      "Operator, service scope, jurisdiction, support, suspension, liability, and change terms remain open.",
    governance: independentReviewRequired(
      "Legal operator and legal reviewer — unassigned",
    ),
    sections: [
      {
        title: "Current effect",
        body: "The repository is available under its open-source licence. Separate terms will be required for any operator-hosted service.",
      },
      {
        title: "Professional responsibility",
        body: "Future terms must preserve the user’s responsibility to verify sources, protect information, supervise work, and exercise independent professional judgment.",
      },
      {
        title: "No legal service or authority guarantee",
        body: "ROSS is software, not a lawyer, law firm, court, government service, comprehensive citator, or substitute for professional judgment. A hosted agreement must define service availability, source limits, beta changes, support, suspension, termination, warranties, liability, and dispute terms before it can bind anyone.",
      },
      {
        title: "Open-source code",
        body: "Repository use is governed by AGPL-3.0 and applicable notices. A hosted-service agreement cannot remove recipients’ rights under the code licence or replace the corresponding-source obligation for a network deployment.",
      },
    ],
  },
  "acceptable-use": {
    title: "Acceptable use — controlled-beta draft",
    eyebrow: "Controlled beta",
    summary:
      "ROSS is intended for lawful professional work by registered beta participants using synthetic or non-confidential materials.",
    status: "Enforcement controls and final policy remain open.",
    governance: independentReviewRequired(
      "Operator, security, and legal reviewers — unassigned",
    ),
    sections: [
      {
        title: "Prohibited during beta",
        body: "Do not submit privileged, confidential, regulated, proprietary, or real client material; attempt unauthorized access; misrepresent output as verified authority; or use the service for consumer legal advice.",
      },
      {
        title: "Report concerns",
        body: "Security issues belong in private vulnerability reporting. Other concerns will use the contact workflow after it is implemented.",
      },
      {
        title: "Source and system integrity",
        body: "Do not bypass access controls, probe another user’s matter, upload malware, abuse source providers, scrape prohibited services, inject instructions intended to exfiltrate secrets, or represent unverified output as an official or human-reviewed source.",
      },
    ],
  },
  accessibility: {
    title: "Accessibility",
    eyebrow: "WCAG 2.2 AA target",
    summary:
      "New ROSS public surfaces target accessible semantics, keyboard operation, visible focus, contrast, zoom, and reduced-motion support.",
    status:
      "Independent manual accessibility review is approved with no unresolved Critical or High findings; this is not a blanket conformance certification for every assistive-technology combination.",
    governance: independentlyReviewed(
      "Accessibility owner — AR",
      "Accessibility reviewer report; approval evidence retained by AR",
    ),
    sections: [
      {
        title: "Built into the public site",
        body: "The site includes a skip link, semantic landmarks, labelled navigation, keyboard-visible focus, responsive layouts, and reduced-motion handling.",
      },
      {
        title: "Feedback",
        body: "Accessibility feedback may be sent to abhi@soundmarklaw.com without including client information or confidential facts.",
      },
    ],
  },
  contact: {
    title: "Contact ROSS",
    eyebrow: "Verified channels",
    summary:
      "Security-sensitive reports use private GitHub vulnerability reporting. Support, privacy, accessibility, and complaints use abhi@soundmarklaw.com.",
    status:
      "Do not send client information, privileged material, credentials, or confidential facts through email or a public issue.",
    governance: independentReviewRequired(
      "Legal operator and support owner — Abhi Ranade",
    ),
    sections: [
      {
        title: "Security",
        body: "Use the repository’s private vulnerability reporting for security-sensitive details. Do not place vulnerability details in a public issue.",
      },
      {
        title: "Support, privacy, and accessibility",
        body: "Email abhi@soundmarklaw.com for support, privacy questions or complaints, accessibility feedback, legal, licensing, or partnership enquiries. The repository issue tracker may be used for non-sensitive software defects and feature discussion.",
      },
    ],
  },
  about: {
    title: "About ROSS",
    eyebrow: "Ranade OSS",
    summary:
      "ROSS is an Ontario-focused, open-source legal workspace in development and a modified fork of Mike.",
    status:
      "Abhi Ranade is the legal operator and product owner. Independent privacy, security, accessibility, and Ontario legal reviews are recorded for the controlled-beta boundary.",
    governance: engineeringReviewed("Product owner — Abhi Ranade"),
    sections: [
      {
        title: "Purpose",
        body: "The project aims to preserve a useful open-source legal workspace while adding authorized, traceable Ontario and Canadian legal sources and Canadian drafting defaults.",
      },
      {
        title: "Independence",
        body: "ROSS is not affiliated with or endorsed by governments, courts, CanLII, CourtListener, A2AJ, source providers, or the upstream Mike maintainers.",
      },
      {
        title: "Contributors",
        body: "Contributor records and governance will be published as the project develops.",
      },
    ],
  },
  docs: {
    title: "Documentation",
    eyebrow: "Versioned project records",
    summary:
      "Architecture decisions, product boundaries, verification reports, and contributor guidance live with the source code.",
    status:
      "Release, restore, rollback, source-health, monitoring, and launch procedures are documented; live operational evidence remains pending.",
    governance: engineeringReviewed("ROSS technical maintainers"),
    sections: [
      {
        title: "Start with the repository",
        body: "The README covers the inherited application. The docs directory records the baseline, product boundary, architecture decisions, brand rules, and verification results.",
      },
    ],
  },
  updates: {
    title: "Project updates",
    eyebrow: "Versioned changelog",
    summary:
      "Future product, security, source-coverage, and legal-content updates will carry effective and review dates.",
    status:
      "The first engineering update is published; security-sensitive detail remains in private reporting.",
    governance: engineeringReviewed("ROSS release maintainers"),
    sections: [
      {
        title: "Publication policy",
        body: "Material changes should distinguish software releases from source, prompt, workflow, policy, and coverage changes.",
      },
    ],
  },
  status: {
    title: "Service status",
    eyebrow: "Public status location",
    summary:
      "The public website is an engineering checkpoint. The verified-account public beta remains blocked until the recorded launch gates pass; no client-material service is approved.",
    status:
      "This /status page is the approved public status location for launch; application, API, legal-source health, and monitoring evidence remain pre-production.",
    governance: independentReviewRequired("Operations owner — AR"),
    sections: [
      {
        title: "Status reporting",
        body: "This page is the public status location until a separate service is approved. It will cover website, application, API, legal-source ingestion, and material incidents.",
      },
      {
        title: "Release control",
        body: "Production promotion fails closed unless legal, privacy, security, accessibility, product, Ontario benchmark, source-health, operational, and launch evidence all belong to the same immutable candidate.",
      },
    ],
  },
  readiness: {
    title: "Launch readiness",
    eyebrow: "Fail-closed release status",
    summary:
      "ROSS has executable engineering gates, recorded independent reviews, named ownership, approved public domains and contacts, and operational runbooks. Live-environment exercises and final vendor verification remain pending.",
    status:
      "Blocked: the object-store endpoint/provider and retention enforcement, effective notices, final-candidate source observation, staging, restore, rollback, monitoring, and other operational evidence are not yet approved.",
    governance: independentReviewRequired(
      "Release owner — AR; product owner — Abhi Ranade",
    ),
    sections: [
      {
        title: "What the code enforces",
        body: "The candidate gate binds the Ontario evaluation, legal and product approvals, operational exercises, launch decisions, source health, and governed artifact hashes to a production decision. Missing evidence blocks release.",
      },
      {
        title: "What people must still do",
        body: "Operator, domains, contacts, controlled-beta terms, privacy, security, accessibility, legal content, and product decisions are recorded. Remaining work is operational verification, final vendor disclosure, effective notices, and immutable-candidate evidence.",
      },
      {
        title: "Current safe boundary",
        body: "The website remains no-index until publication approval. Any preview or authenticated public-beta use remains limited to synthetic or affirmatively non-confidential material. No confidential or privileged client-material launch is authorized.",
      },
      {
        title: "Promotion and rollback",
        body: "A reviewed immutable artifact is promoted only after a staging journey, migration dry run, isolated backup restore, rollback exercise, monitoring test, source observation, dependency review, and incident exercise produce dated evidence.",
      },
    ],
  },
  subprocessors: {
    title: "Subprocessors",
    eyebrow: "Launch vendor inventory",
    summary:
      "The owner selected Supabase Free in ca-central, Fly services in Toronto, user-supplied OpenAI keys, the public site, and public contact channels. ROSS does not intentionally add product analytics at launch.",
    status:
      "The separately configured S3-compatible object-store provider/region, retention enforcement, and remaining provider terms still require verification before this list can take effect.",
    governance: independentlyReviewedPendingEffect(
      "Legal operator — Abhi Ranade; privacy evidence retained by AR",
      "Independent privacy expert; evidence retained by AR",
    ),
    sections: [
      {
        title: "Required disclosure",
        body: "The effective inventory must identify purpose, data categories, product/tier, region, retention, access, contractual basis, and review date for each service. User-selected model and connector providers must also be disclosed as user-directed processing.",
      },
      {
        title: "Candidate categories",
        body: "Recorded launch categories include Supabase authentication/database and account email, private S3-compatible object storage, user-supplied OpenAI access, Fly hosting and private worker, public-site hosting, logging, monitoring, backups, and support. Fly application hosting does not identify the separate object-store provider.",
      },
    ],
  },
  "responsible-ai": {
    title: "Responsible AI and verification",
    eyebrow: "Human review is required",
    summary:
      "Model output is not authority. ROSS is designed to connect propositions to inspectable sources and make uncertainty visible.",
    status:
      "Automated thresholds, Ontario-lawyer benchmark review, and independent adjudication are complete; source gaps and the remaining launch gates stay explicit.",
    governance: independentlyReviewed(
      "Legal-content and evaluation owner — AR",
      "Independent Ontario lawyer; evidence retained by AR",
    ),
    sections: [
      {
        title: "Verification",
        body: "A source link alone does not prove that the cited passage supports the proposition, remains current, or has not been limited. Those are distinct checks.",
      },
      {
        title: "Evaluation",
        body: "The versioned Ontario gate measures source completeness, proposition support, jurisdiction, temporal accuracy, citation precision, coverage gaps, refusal behaviour, prompt-injection resistance, and preservation of inherited functions. Its current 11 cases are synthetic engineering fixtures, not a lawyer-authored benchmark.",
      },
      {
        title: "Release boundary",
        body: "A passing benchmark does not make model output legal advice or prove comprehensive source coverage. The benchmark, legal-content, security, accessibility, and product reviews are recorded; privacy and operational launch evidence remain fail-closed.",
      },
    ],
  },
  demo: {
    title: "Synthetic Ontario product demonstration",
    eyebrow: "No client information",
    summary:
      "A captioned, text-equivalent demonstration shows how ROSS is intended to expose source, passage, currency, treatment, and coverage states.",
    status:
      "Illustrative engineering demonstration using fictional facts and citations; it is not legal advice or evidence of live provider coverage.",
    governance: engineeringReviewed("ROSS product maintainers"),
    sections: [
      {
        title: "Synthetic scenario",
        body: "A fictional lawyer asks ROSS to compare two invented Ontario appellate passages for a demonstration matter called Northstar Components. No real person, client, dispute, authority, or confidential information is represented.",
      },
      {
        title: "Caption",
        body: "The demonstration panel shows a fictional Ontario matter, a user request, a response that identifies conflicting authorities, and separate badges for citation, passage, currency, and treatment verification. A visible warning says that comprehensive treatment data is unavailable.",
      },
      {
        title: "Transcript",
        body: "User: Compare the supplied passages and identify the conflict without resolving it from memory. ROSS: The two fictional passages use different tests. Both passages were retrieved from the supplied synthetic record. Citation and passage checks passed for the fixture; currency metadata is present; comprehensive treatment is unavailable. Verify the full decisions and current law before relying on the comparison.",
      },
      {
        title: "What this demonstrates",
        body: "The intended interaction distinguishes retrieved evidence from model prose, exposes unavailable checks, keeps jurisdiction visible, and requires professional review. It does not demonstrate legal accuracy, good-law status, production confidentiality, or filing readiness.",
      },
    ],
  },
};

export const publicUpdates = [
  {
    slug: "foundation",
    title: "Ontario product foundation and trust gates",
    publishedAt: "2026-07-16",
    status: "Engineering update — selected independent approvals completed",
    summary:
      "ROSS now has an Ontario-first provider layer, draft workflows, controlled-beta data boundary, and synthetic evaluation gate while preserving inherited Mike functions.",
    changes: [
      "Implemented A2AJ, official Ontario and federal legislation, Canadian citation, procedure-source, and disabled licensed-provider boundaries.",
      "Added five governed Ontario workflow drafts and retained inherited Mike workflows and optional U.S. CourtListener research.",
      "Enforced synthetic or non-confidential hosted-beta acknowledgement and fail-closed production configuration.",
      "Added an 11-case synthetic Ontario evaluation seed, generated report, accessibility/performance contracts, and independent-approval gate.",
    ],
    limitations:
      "The operator, public domains and contacts are recorded, and the benchmark, workflows, and privacy decision are approved. Exact storage-provider verification, effective vendor notices, confidential-data mode, comprehensive citator, and final operational launch evidence remain unapproved.",
  },
  {
    slug: "release-controls",
    title: "Production-readiness controls remain fail-closed",
    publishedAt: "2026-07-16",
    status: "Engineering update — launch remains blocked",
    summary:
      "ROSS adds governed release artifacts, source quarantine, operational evidence, launch decisions, and indexing safeguards without claiming that external reviews or live exercises have occurred.",
    changes: [
      "Added required-provider freshness, quarantine, and recovery policy with a deliberately unobserved pre-production health report.",
      "Added an immutable SHA-256 release manifest and manual CI evidence workflow with no automatic production deployment.",
      "Added release, backup/restore, rollback, source, monitoring, incident, and launch procedures tied to dated evidence.",
      "Added a public readiness page and a launch flag that cannot enable indexing while the operator, reviewed limited-source posture, or domain remains a placeholder.",
    ],
    limitations:
      "The legal operator, domains, contacts, go-live owner decision, privacy approval, penetration retest, accessibility review, and Ontario-lawyer review are recorded. Storage-provider verification, effective notices, final-candidate source observation, isolated restore, and staging rollback evidence remain open.",
  },
] as const;
