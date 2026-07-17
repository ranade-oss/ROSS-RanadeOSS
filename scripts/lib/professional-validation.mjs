const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DISCLOSURE_MODES = new Set(["named", "anonymous"]);
const DATE_BASES = new Set(["review-date", "approval-recorded-date"]);
const VERIFICATION_METHODS = new Set([
  "signed-anonymous-reviewer-attestation",
  "confidential-identity-check",
  "trusted-intermediary-attestation",
  "accountable-owner-attestation",
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
    if (record.status !== "blocked-awaiting-professional-validation")
      blockers.push("Pending development record must remain explicitly blocked.");
    if (benchmark.releaseApproved !== false)
      blockers.push("Synthetic benchmark cannot be release-approved in development mode.");
    if (workflowCatalogue.some((item) => item.status !== "draft-awaiting-lawyer-review"))
      blockers.push("Development catalogue contains a workflow represented as approved.");
    if (record.workflowReviews?.some((item) => item.status !== "pending-ontario-lawyer-review"))
      blockers.push("Development workflow review status is not explicitly pending.");
    warnings.push("Authorized Ontario case-law provider selection is pending.");
    warnings.push("Ontario lawyer benchmark authorship and independent adjudication are pending.");
    warnings.push("Five Ontario workflow reviews are pending.");
    warnings.push("Privacy, security, and accessibility approvals are pending.");
    return { mode: "development", ready: blockers.length === 0, blockers, warnings };
  }

  if (record.status !== "approved-for-controlled-beta")
    blockers.push("Professional validation record is not approved-for-controlled-beta.");
  if (record.scope?.status !== "approved-by-ontario-lawyer")
    blockers.push("Ontario practice scope is not lawyer-approved.");
  for (const area of record.scope?.practiceAreas ?? [])
    if (area.status !== "approved-by-ontario-lawyer")
      blockers.push(`Practice area ${area.id} is not lawyer-approved.`);

  const source = record.legalSourceDecision;
  if (source?.status !== "approved-authorized-provider")
    blockers.push("Authorized Ontario case-law provider has not been approved.");
  for (const field of [
    "selectedProvider",
    "authorizationBasis",
    "agreementOrAuthorizationId",
    "decisionOwner",
    "evidence",
  ])
    if (!text(source?.[field])) blockers.push(`Legal-source decision ${field} is missing.`);
  if (!dated(source?.decisionDate)) blockers.push("Legal-source decision date is missing or invalid.");
  if (!Array.isArray(source?.allowedOperations) || source.allowedOperations.length === 0)
    blockers.push("Legal-source allowed operations are missing.");
  for (const court of source?.requiredCoverage ?? [])
    if (!source?.verifiedCoverage?.includes(court))
      blockers.push(`Legal-source coverage is not verified for ${court}.`);

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
