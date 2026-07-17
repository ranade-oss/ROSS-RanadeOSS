# Deliverable E — Ontario professional-validation gate

## Outcome

Deliverable E creates the evidence-bearing path from an engineering prototype to
a professionally validated Ontario controlled beta. It does **not** manufacture
provider permission, lawyer review, or privacy/security/accessibility approval.
All current records remain explicitly pending and confidential use remains
blocked.

The recommended initial scope is Ontario civil litigation/appeals and Ontario
Small Claims Court because those areas match the five existing draft workflows.
Ontario criminal, family, tribunal, real-estate, and unbenchmarked practice areas
remain explicitly unsupported.

## Included controls

- Versioned professional-validation record and fail-closed validator.
- Authorized case-law provider decision record with court coverage and operation
  constraints; CanLII scraping remains prohibited.
- Ontario lawyer benchmark authoring and independent-adjudication template.
- Evidence-backed review path for all five Ontario workflows.
- Privacy, security, and accessibility review template.
- Controlled transition from workflow draft status to
  `lawyer-reviewed-approved`; current entries remain drafts.
- Production release gate integration and automated positive/negative tests.

## Commands

- `npm run validation:check:development` must pass and list the pending external work.
- `npm run validation:check` is expected to fail until real evidence-backed approvals exist.
- `npm run test:evaluation` tests both the professional-validation and Ontario evaluation gates.
- `npm run release:check` remains fail-closed for production.

## External actions that code cannot complete

1. Select and obtain authorization for an Ontario case-law provider that covers
   ONCA, ONSC, and Small Claims decisions for the allowed operations.
2. Retain an Ontario lawyer to author/substantively review the benchmark and a
   second qualified reviewer to adjudicate it.
3. Obtain an Ontario lawyer review of each of the five workflow drafts.
4. Complete privacy, security, and accessibility reviews before confidential
   files or expanded access are approved.

After those records are completed, update the versioned JSON and catalogue,
regenerate workflows and the release manifest, run the full check, and retain
the evidence with the release record.
