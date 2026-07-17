# ROSS governance — anonymous independent professional review

Status: Proposed governance amendment

Recorded: 2026-07-17

## Decision

ROSS may accept an independent professional review when the reviewer's public
identity and Law Society number are withheld. Anonymity does not remove the
substantive review requirements or permit an unrecorded assertion to satisfy a
release gate.

This option exists so a qualified reviewer can provide candid, independent
review without being publicly identified or associated with the product.

## Required public record

The public repository record must contain:

1. A stable reviewer label, such as `Anonymous independent Ontario lawyer`.
2. Disclosure mode: `named` or `anonymous`.
3. The professional status relied upon, including the jurisdiction.
4. An affirmative statement that the reviewer was independent of authorship,
   implementation, and the release decision.
5. The exact artifact identifier, version, and cryptographic hash reviewed.
6. The review decision: `approved`, `approved-with-non-substantive-conditions`,
   or `not-approved`.
7. The review date, or—if the actual review date was not retained—the date on
   which the approval was received or recorded and a field identifying that
   date basis.
8. All qualifications, corrections, exclusions, and required additional cases.
9. A durable evidence path.
10. A verification record naming the accountable person or trusted
    intermediary who recorded the anonymous review.

The public record must not include information that could identify an anonymous
reviewer unless the reviewer expressly authorizes disclosure.

## Permitted verification methods

At least one of the following must be recorded:

- a signed anonymous reviewer attestation;
- a confidential identity and practising-status check by an accountable owner;
- verification by a trusted intermediary; or
- an accountable-owner attestation that the reviewer represented themselves as
  an independent lawyer licensed in the required jurisdiction and communicated
  the recorded decision.

The verification record must identify the method, the accountable verifier,
the verification or recording date, and its evidence path. For the
accountable-owner method, the record must say explicitly that the reviewer's
identity or licence number was not independently retained or publicly verified.

## Acceptance rule

An anonymous review is acceptable for the professional-validation gate only
when all of the following are true:

- `adjudicatorDisclosureMode` is `anonymous`;
- `independentAdjudicator` and `adjudicatorProfessionalStatus` are non-empty;
- `adjudicatorIndependenceAttested` is `true`;
- the reviewed version and hash are present in the evidence;
- `adjudicationDecision` is `approved`;
- `adjudicationDate` is a valid date and `adjudicationDateBasis` explains what
  the date represents;
- `adjudicationEvidence` is non-empty;
- the nested verification status is `verified` and its method, accountable
  verifier, date, and evidence are present; and
- no material qualification or required correction remains unresolved.

A reviewer label alone, an undocumented oral assertion, or an anonymous review
that cannot be tied to the exact artifact must fail closed.

## Repository model

`config/professional-validation.v1.json` should represent the adjudication with
the following fields under `benchmarkReview`:

```json
{
  "independentAdjudicator": "Anonymous independent Ontario lawyer",
  "adjudicatorDisclosureMode": "anonymous",
  "adjudicatorProfessionalStatus": "Ontario lawyer; identity withheld",
  "adjudicatorIndependenceAttested": true,
  "adjudicationDate": "YYYY-MM-DD",
  "adjudicationDateBasis": "review-date or approval-recorded-date",
  "adjudicationDecision": "approved",
  "adjudicationEvidence": "reviews/benchmark-adjudication-anonymous.md",
  "adjudicatorVerification": {
    "status": "verified",
    "method": "accountable-owner-attestation",
    "verifiedBy": "Named accountable owner",
    "verificationDate": "YYYY-MM-DD",
    "evidence": "reviews/benchmark-adjudication-anonymous.md"
  }
}
```

## Validator and test changes

The professional-validation validator should accept either named or anonymous
independent adjudication. Both modes must require the same version-specific
decision, date, independence, professional-status, evidence, and verification
fields. Tests must prove that a complete anonymous record can pass and that a
bare anonymous label fails.

## Scope and limitations

This amendment changes disclosure and evidence mechanics only. It does not:

- relax the requirement for an independent Ontario-lawyer review;
- change the 100% benchmark thresholds;
- approve confidential-material use;
- approve a legal-source provider, privacy, security, accessibility, or public
  production release;
- authorize ROSS to practise law or eliminate supervising-lawyer review; or
- allow public claims broader than the exact validated scope.

