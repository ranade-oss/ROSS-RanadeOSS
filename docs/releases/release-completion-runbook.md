# ROSS release-completion runbook

Deliverable H is the final development package before the ROSS public beta. The
work after H is release operation and evidence completion, not another
development deliverable. This runbook does not convert an unperformed review or
exercise into evidence.

## Reserved release identifier

ROSS reserves this release identifier in Deliverable H:

`ross-public-beta-20260717-rc1`

A reserved identifier is not itself an approval. The existing fail-closed
professional, review, operations, launch, and final-completion gates still
decide whether the candidate may be tagged or deployed.

The release identifier deliberately does not contain a Git commit hash. Putting
a commit-derived identifier inside tracked files would create a new commit and
change the hash it was intended to identify. Instead:

1. the stable name is reserved in the governed records;
2. the release-candidate workflow runs every engineering and governance gate;
3. only after those gates pass, the workflow creates an annotated Git tag with
   the reserved name on the checked-out commit; and
4. the deployment workflow proves that the tag exists and points to the exact
   commit being deployed.

The workflow never moves an existing release tag. If source changes after the
tag is created, reserve a new candidate such as
`ross-public-beta-20260717-rc2`.

## After Deliverable H is merged

No Deliverable I is planned. Complete the following evidence on a short
release-evidence branch or through the GitHub web editor, then merge it after
Baseline Verification passes. These are governed records for the reserved
candidate, not a new software package.

### 1. Authorized Ontario case-law coverage

Record, with dates and scope:

- the authorized provider and permission or licence relied on;
- courts, tribunals, date ranges, document types, full-text status, limits,
  quotas, and known gaps;
- production credentials being present without recording their values;
- contract and health tests using synthetic queries; and
- the accountable legal-source decision.

CanLII feedback or API access does not authorize website scraping or imply
coverage beyond the permission actually granted.

### 2. Independent reviews

Obtain and record independent privacy, security, and accessibility reviews.
Each record must identify the reserved release ID, reviewed commit, scope,
method, findings, severity, remediation disposition, reviewer role, decision,
and date. Anonymous professional legal review remains acceptable under the
separate Ontario-workflow governance rule; that exception does not
automatically apply to these technical reviews.

### 3. Operational exercises

Execute with synthetic data and retain evidence for:

- database and object restoration;
- application rollback and incompatible-migration protection;
- key rotation and access revocation;
- incident detection, containment, notification assessment, and recovery;
- source outage/degraded-mode handling;
- account export and deletion; and
- post-deployment website, authentication, upload, document, assistant, and
  legal-source smoke tests.

Record actual timestamps, accountable roles, tested commit, results, defects,
remediation, and rerun outcomes.

### 4. Accountable launch decisions

The named accountable owners decide and record:

- approved audience and public self-registration state;
- supported jurisdictions, sources, document types, and limitations;
- hosted-data boundary and current terms/privacy versions;
- monitoring, support, incident escalation, cost limits, rollback authority,
  and stop conditions; and
- whether every unresolved finding is release-blocking.

### 5. Finalize governed records

Keep `ross-public-beta-20260717-rc1` unchanged in:

- `config/final-completion.v1.json`;
- `config/professional-validation.v1.json`;
- `config/release-approvals.v1.json`;
- `config/operations-readiness.v1.json`;
- `config/launch-readiness.v1.json`; and
- `config/release-manifest.v1.json`.

Mark an item complete only when its referenced evidence exists and applies to
the candidate. Regenerate the completion dossier and manifest, then run:

```text
npm run build:completion-dossier
npm run build:release-manifest
npm run check
npm run final:check
```

Merge this final evidence update only after checks pass. It is the release
record for H, not another development deliverable.

### 6. Create the immutable candidate

From GitHub Actions, run **Release candidate evidence** on the final merged
`main` commit. Leave the candidate input as:

`ross-public-beta-20260717-rc1`

The workflow:

- validates that every governed record uses that identifier;
- reruns the complete engineering gate;
- archives non-secret evidence; and
- creates or confirms an annotated tag with that name on the exact verified
  commit.

If any gate fails, do not create the tag and do not deploy.

### 7. Launch the public beta

Run **Deploy public ROSS beta** using the same identifier. The deployment
workflow checks that the immutable tag points to the checked-out commit and
runs `npm run final:check` before any Fly.io change.

After deployment, run and record the smoke tests. If a source change is needed,
do not move the tag. Reserve an `rc2` identifier and repeat the candidate
process.
