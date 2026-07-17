# ROSS final owner action sheet

This is the shortest path after Deliverable F is merged. Complete the actions
in order for one immutable release candidate. Do not change a JSON status to
approved until the named evidence actually exists.

1. **Authorized case-law coverage.** Obtain express authorization for API or
   original-source access covering ONCA, ONSC, and Ontario Small Claims for the
   operations ROSS will perform. A2AJ currently reports ONCA coverage but not
   ONSC or Small Claims. CanLII website scraping/systematic downloading remains
   prohibited. Complete the provider record from Deliverable E.
2. **Ontario benchmark.** Engage an Ontario lawyer to author or substantively
   review every benchmark case and a second qualified reviewer to adjudicate
   disagreements. Commit only non-confidential prompts and evidence references.
3. **Five workflow reviews.** Obtain a separate version-specific review for
   every workflow. Apply required changes, bump versions, and record matching
   reviewer/date/evidence metadata in the catalogue and validation record.
4. **Independent assurance.** Complete legal-content, privacy, security, and
   accessibility reviews. Keep confidential vulnerability detail outside Git;
   commit only bounded evidence references.
5. **Operational exercises.** For the same candidate, complete CI, staging
   journey, migration, backup/restore, rollback, observability, source-health,
   dependency, and incident exercises.
6. **Launch decisions.** Name the legal operator and accountable owners; approve
   domains, vendors/residency, effective notices, support/privacy contacts,
   beta cohort/terms, and the go-live decision.
7. **Immutable candidate.** Assign one release ID everywhere, rebuild generated
   records, run the release-candidate workflow, and deploy that exact candidate
   to isolated staging.
8. **Final gate.** Run `npm run final:check`. Any blocker ends the promotion
   attempt. If it passes, run the GitHub **Final controlled-beta evidence**
   workflow and retain its artifact and approval record.
9. **Limited launch.** Launch only the invitation-only synthetic or
   non-confidential cohort. Public indexing and confidential/privileged files
   remain outside this approval.

There is no further software package after F unless a reviewer requires code
changes, a provider contract requires a specific adapter, or the product scope
is expanded.
