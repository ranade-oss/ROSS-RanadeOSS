const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DISCLOSURE_MODES = new Set(["named", "anonymous"]);
const DATE_BASES = new Set(["review-date", "approval-recorded-date"]);
const VERIFICATION_METHODS = new Set([
  "signed-anonymous-reviewer-attestation",
  "confidential-identity-check",
  "trusted-intermediary-attestation",
  "accountable-owner-attestation",
]);
const SOURCE_DECISION_MODES = new Set([
  "approved-authorized-provider",
  "approved-limited-source-beta",
]);

const text = (value) => typeof value === "string" && value.trim().length > 0;
const dated = (value) => text(value) && DATE.test(value);

function requireReview(record, label, blockers) {
  if (record?.status !== "approved-by-ontario-lawyer")
    blockers.push(`${label} is not approved by an Ontario lawyer.`);
  for (const field of ["reviewer", "professionalStatus", "evidence"])
    if (!text(record?.[field])) blockers.push(`${label} ${field} is missing.`);
  if (!dated(record?.reviewDate)) blockers.push(`${label} reviewDate is missing or invalid.`);
}

function requireIndependentAdjudication(review, blockers) {
  const label = "Ontario benchmark independent adjudication";
  if (!DISCLOSURE_MODES.has(review?.adjudicatorDisclosureMode))
    blockers.push(`${label} disclosure mode is missing or invalid.`);
  for (const field of [
    "independentAdjudicator",
    "adjudicatorProfessionalStatus",
    "adjudicationEvidence",
  ])
    if (!text(review?.[field])) blockers.push(`${label} ${field} is missing.`);
  if (review?.adjudicatorIndependenceAttested !== true)
    blockers.push(`${label} independence is not attested.`);
  if (!dated(review?.adjudicationDate))
    blockers.push(`${label} date is missing or invalid.`);
  if (!DATE_BASES.has(review?.adjudicationDateBasis))
    blockers.push(`${label} date basis is missing or invalid.`);
  if (review?.adjudicationDecision !== "approved")
    blockers.push(`${label} decision is not approved.`);

  const verification = review?.adjudicatorVerification;
  if (verification?.status !== "verified")
    blockers.push(`${label} verification is not complete.`);
  if (!VERIFICATION_METHODS.has(verification?.method))
    blockers.push(`${label} verification method is missing or invalid.`);
  for (const field of ["verifiedBy", "evidence"])
    if (!text(verification?.[field]))
      blockers.push(`${label} verification ${field} is missing.`);
  if (!dated(verification?.verificationDate))
    blockers.push(`${label} verification date is missing or invalid.`);
}

function requireApprovedScope(record, blockers) {
  if (record.scope?.status !== "approved-by-ontario-lawyer")
    blockers.push("Ontario practice scope is not lawyer-approved.");
  for (const area of record.scope?.practiceAreas ?? [])
    if (area.status !== "approved-by-ontario-lawyer")
      blockers.push(`Practice area ${area.id} is not lawyer-approved.`);
}

function requireLegalSourceDecision(source, blockers, warnings) {
  if (!SOURCE_DECISION_MODES.has(source?.status)) {
    blockers.push("Ontario case-law source posture has not been approved.");
    return;
  }

  for (const field of ["authorizationBasis", "decisionOwner", "evidence"])
    if (!text(source?.[field])) blockers.push(`Legal-source decision ${field} is missing.`);
  if (!dated(source?.decisionDate)) blockers.push("Legal-source decision date is missing or invalid.");
  if (!Array.isArray(source?.allowedOperations) || source.allowedOperations.length === 0)
    blockers.push("Legal-source allowed operations are missing.");

  if (source.status === "approved-authorized-provider") {
    for (const field of ["selectedProvider", "agreementOrAuthorizationId"])
      if (!text(source?.[field])) blockers.push(`Legal-source decision ${field} is missing.`);
    for (const court of source?.requiredCoverage ?? [])
      if (!source?.verifiedCoverage?.includes(court))
        blockers.push(`Legal-source coverage is not verified for ${court}.`);
    return;
  }

  if (source.licensedProviderEnabled !== false)
    blockers.push("Limited-source beta must keep the platform-supplied licensed provider disabled.");
  if (source.comprehensiveCoverageClaimed !== false)
    blockers.push("Limited-source beta must not claim comprehensive case-law coverage.");
  if (source.researchClaimsRestricted !== true)
    blockers.push("Limited-source beta must restrict legal-research coverage claims.");
  if (source.availabilityDisclosureRequired !== true)
    blockers.push("Limited-source beta must disclose source availability and coverage gaps.");
  if (source.modelMemoryFallbackAllowed !== false)
    blockers.push("Limited-source beta must prohibit model-memory substitution for missing sources.");
  if (source.platformProviderAccessRequired !== false)
    blockers.push("Limited-source beta must not depend on platform-supplied provider access.");
  if (source.sharedProviderCredentialsAllowed !== false)
    blockers.push("Limited-source beta must prohibit shared legal-source credentials.");
  if (source.perUserAuthorizationResponsibilityDisclosed !== true)
    blockers.push("Limited-source beta must disclose each user's provider authorization responsibility.");
  for (const provider of ["canlii", "courtlistener"])
    if (!source?.perUserApiKeysSupported?.includes(provider))
      blockers.push(`Limited-source beta must record optional per-user ${provider} credentials.`);

  const required = source.requiredCoverage ?? [];
  const deferred = source.deferredCoverage ?? [];
  if (!Array.isArray(deferred) || deferred.length === 0)
    blockers.push("Limited-source beta deferred coverage is missing.");
  for (const court of required)
    if (!deferred.includes(court) && !source?.verifiedCoverage?.includes(court))
      blockers.push(`Limited-source beta does not classify required coverage for ${court}.`);
  if (blockers.length === 0)
    warnings.push(`Limited-source beta defers comprehensive coverage for: ${deferred.join(", ")}.`);
}

function requireApprovedProfessionalReviews(
  record,
  benchmark,
  workflowCatalogue,
  blockers,
) {
  requireReview(record.benchmarkReview, "Ontario benchmark review", blockers);
  requireIndependentAdjudication(record.benchmarkReview, blockers);
  if (benchmark.status !== "ontario-lawyer-reviewed-approved" || benchmark.releaseApproved !== true)
    blockers.push("Versioned Ontario benchmark is not lawyer-reviewed and release-approved.");
  if (benchmark.reviewer !== record.benchmarkReview?.reviewer)
    blockers.push("Benchmark reviewer does not match the professional-validation record.");

  const catalogueBySlug = new Map(workflowCatalogue.map((item) => [item.slug, item]));
  for (const review of record.workflowReviews ?? []) {
    requireReview(review, `Workflow ${review.slug}`, blockers);
    if (!dated(review.sourceAsOfDate))
      blockers.push(`Workflow ${review.slug} sourceAsOfDate is missing or invalid.`);
    const workflow = catalogueBySlug.get(review.slug);
    if (workflow?.status !== "lawyer-reviewed-approved")
      blockers.push(`Workflow ${review.slug} catalogue status is not lawyer-reviewed-approved.`);
    if (workflow?.reviewer !== review.reviewer || workflow?.reviewDate !== review.reviewDate)
      blockers.push(`Workflow ${review.slug} catalogue review metadata does not match.`);
    if (workflow?.reviewEvidence !== review.evidence)
      blockers.push(`Workflow ${review.slug} catalogue evidence does not match.`);
  }
}

export function evaluateProfessionalValidation(
  record,
  benchmark,
  workflowCatalogue,
  releaseApprovals,
  production = false,
) {
  const blockers = [];
  const warnings = [];
  const workflowSlugs = new Set(workflowCatalogue.map((item) => item.slug));
  const reviewSlugs = new Set((record.workflowReviews ?? []).map((item) => item.slug));

  if (record.legalSourceDecision?.canliiScrapingAllowed !== false)
    blockers.push("CanLII scraping must remain prohibited.");
  if (record.confidentialDataBoundary?.confidentialUseApproved !== false && !production)
    blockers.push("Development validation cannot silently approve confidential use.");
  if (!Array.isArray(record.scope?.practiceAreas) || record.scope.practiceAreas.length === 0)
    blockers.push("At least one proposed Ontario practice area is required.");
  for (const area of record.scope?.practiceAreas ?? []) {
    for (const slug of area.workflowSlugs ?? [])
      if (!workflowSlugs.has(slug))
        blockers.push(`Practice area ${area.id} references unknown workflow ${slug}.`);
  }
  for (const slug of workflowSlugs)
    if (!reviewSlugs.has(slug)) blockers.push(`Workflow ${slug} has no review record.`);
  for (const slug of reviewSlugs)
    if (!workflowSlugs.has(slug)) blockers.push(`Review record references unknown workflow ${slug}.`);

  if (!production) {
    const pendingBenchmark =
      benchmark.releaseApproved === false &&
      record.benchmarkReview?.status === "pending-ontario-lawyer-authorship-and-review";
    const pendingWorkflows =
      workflowCatalogue.every((item) => item.status === "draft-awaiting-lawyer-review") &&
      record.workflowReviews?.every((item) => item.status === "pending-ontario-lawyer-review");
    const approvedBenchmark =
      benchmark.releaseApproved === true &&
      benchmark.status === "ontario-lawyer-reviewed-approved" &&
      record.benchmarkReview?.status === "approved-by-ontario-lawyer";
    const approvedWorkflows =
      workflowCatalogue.every((item) => item.status === "lawyer-reviewed-approved") &&
      record.workflowReviews?.every((item) => item.status === "approved-by-ontario-lawyer");

    if (pendingBenchmark && pendingWorkflows) {
      if (record.status !== "blocked-awaiting-professional-validation")
        blockers.push("Pending development record must remain explicitly blocked.");
      warnings.push("Authorized Ontario case-law provider selection is pending.");
      warnings.push("Ontario lawyer benchmark authorship and independent adjudication are pending.");
      warnings.push("Five Ontario workflow reviews are pending.");
      warnings.push("Privacy, security, and accessibility approvals are pending.");
    } else if (approvedBenchmark && approvedWorkflows) {
      const limitedSourceBeta =
        record.status === "approved-for-limited-source-controlled-beta" &&
        record.legalSourceDecision?.status === "approved-limited-source-beta";
      if (!limitedSourceBeta && record.status !== "blocked-awaiting-authorized-provider")
        blockers.push("Reviewed development record must use an approved source posture.");
      requireApprovedScope(record, blockers);
      requireApprovedProfessionalReviews(record, benchmark, workflowCatalogue, blockers);
      if (limitedSourceBeta)
        requireLegalSourceDecision(record.legalSourceDecision, blockers, warnings);
      else
        warnings.push("Authorized Ontario case-law provider selection is pending.");
      warnings.push("Privacy, security, and accessibility approvals are pending.");
    } else {
      blockers.push(
        "Professional review is partially integrated; benchmark and all five workflows must move together.",
      );
    }
    return { mode: "development", ready: blockers.length === 0, blockers, warnings };
  }

  if (!["approved-for-controlled-beta", "approved-for-limited-source-controlled-beta"].includes(record.status))
    blockers.push("Professional validation record is not approved for a controlled beta.");
  requireApprovedScope(record, blockers);

  const source = record.legalSourceDecision;
  requireLegalSourceDecision(source, blockers, warnings);

  requireApprovedProfessionalReviews(record, benchmark, workflowCatalogue, blockers);

  for (const name of ["privacy", "security", "accessibility"]) {
    const approval = releaseApprovals?.approvals?.[name];
    if (
      approval?.status !== "approved" ||
      !text(approval.approver) ||
      !dated(approval.date) ||
      !text(approval.evidence)
    ) blockers.push(`${name} approval is missing or incomplete.`);
  }
  if (
    record.confidentialDataBoundary?.confidentialUseApproved === true &&
    !text(record.confidentialDataBoundary?.approvalEvidence)
  ) blockers.push("Confidential-use approval evidence is missing.");

  return { mode: "production", ready: blockers.length === 0, blockers, warnings };
}
