# Ontario case-law provider procurement brief

## Required result

Obtain an authorized, technically usable source for Ontario Court of Appeal,
Ontario Superior Court of Justice, and Ontario Small Claims decisions. The
authorization must expressly cover ROSS's actual operations: search, citation
lookup, document/passage retrieval, model input, generated output, retention,
caching, and user export as applicable.

## Recommended starting strategy

Keep the implemented A2AJ connector for the datasets it reports, including
Ontario Court of Appeal, while seeking an authorized commercial API or
original-source channel for ONSC and Small Claims gaps. Treat all aggregated
copies as unofficial and retain the original-source verification warning.

Do not automate the CanLII website. CanLII's terms dated 2026-06-03 direct
automated or large-scale retrieval to original sources or other authorized
channels and prohibit systematic programmatic downloading. A CanLII route may
be considered only if CanLII gives separate express authorization that covers
the proposed transport and operations.

## Questions for every candidate provider

- Exact courts, tribunals, date ranges, languages, document types, update delay,
  deletions/corrections, publication bans, and completeness measurements.
- API search syntax, stable identifiers, full text, paragraph structure,
  citation resolution, treatment/citator data, rate limits, bulk limits,
  availability, support, change notice, and sandbox.
- Permission for model input/RAG, generated answers, quotations, caching,
  retention, deletion, user download, audit, and incident investigation.
- Canadian processing/storage regions, subprocessors, security documentation,
  breach terms, credential rotation, termination, export, and deletion.
- Price, usage tiers, overages, taxes, term, renewal, suspension, and exit.

## Acceptance evidence

- Executed agreement or express authorization identifier.
- Operation and coverage schedule.
- Non-confidential synthetic staging results for every required court.
- Exact-passage, correction/deletion, publication-ban, rate-limit, outage,
  revocation, and credential-rotation tests.
- Legal, privacy, security, and product-owner approvals.

Primary references as of 2026-07-17:

- https://a2aj.ca/data/
- https://www.canlii.org/info/terms.html
- https://www.ontariocourts.ca/scj/about-the-court-2/decisions-of-the-court/
