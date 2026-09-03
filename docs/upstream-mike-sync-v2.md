# Mike Sync v2

ROSS synchronizes useful capabilities from
[Open-Legal-Products/mike](https://github.com/Open-Legal-Products/mike) without
making the two applications identical. The synchronizer is an implementation
queue, not a general-purpose cherry-pick service.

## What changed

- The queues classify capabilities, not just patch transplantability. A
  ROSS-native adaptation may use existing ROSS seams even when the upstream
  diff does not apply cleanly.
- A branch contains at most one implementation candidate. Related upstream
  work is recorded with a stable `capability`, `series_id`, dependency list,
  and prerequisites so a failed candidate does not discard unrelated work.
- Outcomes distinguish terminal decisions from work that can become feasible:
  `adopted`, `adapted`, `equivalent`, `superseded`, `incompatible`,
  `deferred`, `retryable`, `needs-test-harness`, and `needs-decision`.
- A malformed, non-applying, or failed candidate is recorded as `retryable`
  with a review date. It is not silently converted into a permanent `defer`.
  Existing legacy `defer` records remain terminal and are not revisited by
  scheduled work.
- A candidate may receive one bounded repair attempt using focused test or
  build feedback. Full Baseline remains the authoritative exact-head merge
  gate.
- High-risk work does not receive automatic application code. It produces an
  architecture brief and a draft implementation plan for human review.
- A missing test harness is a prerequisite backlog item, not proof that the
  underlying capability is useless. Once the prerequisite is available, a
  retry can be explicitly or schedule-triggered.

## Outcome and merge policy

| Outcome | Meaning | Automatic code PR? |
| --- | --- | --- |
| `adopted` | ROSS can use the capability substantially as written | Yes, low risk only |
| `adapted` | ROSS implements the capability through ROSS-specific seams | Yes for bounded medium risk |
| `equivalent` | ROSS already has the capability | No |
| `superseded` | A newer or local implementation makes it unnecessary | No |
| `incompatible` | The capability conflicts with an intentional ROSS boundary | No |
| `deferred` | Deliberately terminal after review | No |
| `retryable` | A bounded attempt needs new evidence or a later retry | No until retried |
| `needs-test-harness` | A prerequisite test or evaluation harness is missing | No |
| `needs-decision` | Human architecture, security, legal, or product judgment is required | Draft state-only record |

Low-risk and escalated policies remain separate. Authentication,
authorization, MFA, cryptography, secrets, provider keys, legal/privacy,
schemas, migrations, Supabase/RLS, data boundaries, deployment,
infrastructure, dependencies, lockfiles, governance, release controls, and
production operational changes remain protected. Ontario-first source
coverage, reviewed official sources, attribution, the limited/non-comprehensive
coverage statement, and the connected-provider responsibility boundary are not
upstream synchronization targets.

## Queue operation

The low-risk queue may classify a small observation window, but it advances one
implementation candidate at a time. The escalated queue selects one eligible
candidate in merge order. A scheduled run may select new work or a due
`retryable`/`needs-test-harness` record. A legacy `deferred` record is never
reconsidered automatically. Reconsidering one requires a deliberate manual
dispatch naming the upstream PR and setting the reconsideration input.

Every implementation PR must pass the exact final-head Baseline and the
existing review, mergeability, draft, and trusted-agent gates. No successful
run for an earlier SHA verifies a changed head.

## Deliberate legacy-deferred pass

The escalated workflow exposes a manual `reconsider_all_deferred` input. It
starts one controlled pass over the legacy deferred entries already recorded
in the escalation ledger. The workflow carries that mode forward after each
successful non-draft PR, so entries are reevaluated serially rather than
forming one opaque batch. A high-risk result pauses the pass as a draft. An
entry that is still deliberately deferred after its v2 attempt is not selected
again in that pass.
