const text = (value) => typeof value === "string" && value.trim().length > 0;

export function evaluateFinalCompletion(
  plan,
  professionalValidation,
  sourceOperations,
  releaseReadiness,
  releaseRecords,
  production = false,
) {
  const blockers = [];
  const pending = [];
  const requiredWorkstreams = [
    "authorized-ontario-case-law",
    "lawyer-authored-benchmark",
    "five-workflow-reviews",
    "privacy-security-accessibility",
    "operational-exercises",
    "accountable-launch-decisions",
    "immutable-release-candidate",
  ];
  const byId = new Map((plan.workstreams ?? []).map((item) => [item.id, item]));

  if (plan.target?.dataBoundary !== "synthetic-or-non-confidential-only")
    blockers.push("Final controlled-beta plan expands the approved data boundary.");
  if (plan.target?.confidentialUseApproved !== false)
    blockers.push("Confidential use requires a successor data-boundary review.");
  if (plan.target?.publicIndexingApproved !== false)
    blockers.push("Public indexing is not approved by this deliverable.");
  if (plan.providerStrategy?.canliiWebsiteAutomationAllowed !== false)
    blockers.push("CanLII website automation must remain prohibited.");
  for (const id of requiredWorkstreams) {
    const item = byId.get(id);
    if (!item || !text(item.ownerRole) || !text(item.sourceOfTruth))
      blockers.push(`Final workstream ${id} is missing or incomplete.`);
  }

  if (!production) {
    if (plan.status !== "blocked-awaiting-external-completion")
      blockers.push("Development completion plan must remain explicitly blocked.");
    for (const id of requiredWorkstreams) {
      const status = byId.get(id)?.status;
      if (status === "pending")
        pending.push({ id, ownerRole: byId.get(id).ownerRole });
      else if (status !== "completed-with-evidence")
        blockers.push(
          `Development workstream ${id} must be pending or completed-with-evidence.`,
        );
    }
    return { mode: "development", ready: blockers.length === 0, blockers, pending };
  }

  if (plan.status !== "completed-approved-for-controlled-beta")
    blockers.push("Final completion plan is not approved for the controlled beta.");
  if (!text(plan.releaseId) || plan.releaseId === "unassigned")
    blockers.push("Final release ID is unassigned.");
  for (const [label, releaseId] of Object.entries(releaseRecords ?? {}))
    if (releaseId !== plan.releaseId)
      blockers.push(`${label} release ID does not match the final completion plan.`);
  for (const id of requiredWorkstreams)
    if (byId.get(id)?.status !== "completed-with-evidence")
      blockers.push(`Final workstream ${id} is not completed-with-evidence.`);
  if (professionalValidation?.ready !== true)
    blockers.push("Ontario professional validation is incomplete.");
  if (sourceOperations?.ready !== true)
    blockers.push("Live legal-source operations are incomplete.");
  if (releaseReadiness?.ready !== true)
    blockers.push("Production release readiness is incomplete.");

  return { mode: "production", ready: blockers.length === 0, blockers, pending };
}
