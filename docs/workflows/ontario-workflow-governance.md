# Ontario workflow governance

ROSS-140 adds five in-repository Ontario workflow drafts without changing or replacing any inherited Mike workflow. The build script validates the governed source catalogue and generates additive backend and public-website representations.

## Status model

Every initial entry is `draft-awaiting-lawyer-review`, carries a `0.1.0-draft` version, and has a null reviewer, review date, and review-evidence reference. The authenticated application also displays “Draft — not lawyer-reviewed” in the title and description. A software contributor must not fill those fields or remove the draft label without a recorded independent review by an Ontario lawyer with suitable subject-matter experience.

The generator accepts `lawyer-reviewed-approved` only when reviewer, ISO review date, and evidence path are all present. The matching record in `config/professional-validation.v1.json` must contain the reviewer’s professional status, source-as-of date, and the same evidence reference. This makes a partial or cosmetic approval fail closed.

## Required review record

The reviewer should record their name, professional status, scope of review, review date, source as-of date, issues found, changes required, benchmark results, and approval or rejection. A review applies only to the identified workflow version. Any substantive prompt, source, rule, output, or boundary change requires a new version and review.

## Evaluation material

Each workflow has a deliberately synthetic fixture. These fixtures exercise issue extraction, discovery traceability and potential privilege flags, affidavit discrepancies, unverified citations, and incomplete Small Claims intake. They contain no real people, matters, authorities, or client information.

## Release gate

Before a workflow can be represented as approved:

1. Run the source generator and all repository checks.
2. Have the independent reviewer validate the prompt against current official sources and the applicable professional scope.
3. Evaluate the synthetic fixture plus adversarial cases for invented facts, invented citations, missing-source behavior, unsafe deadline claims, and confidentiality-boundary behavior.
4. Record the reviewer, review date, evidence path, and matching professional-validation record; bump the version and publish the review record.
5. Re-run the full preservation and product gate.

Until then, the public catalogue is a transparent preview and the authenticated workflow is for controlled evaluation only.
