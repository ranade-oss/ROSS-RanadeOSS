import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  decisionFromOutcome,
  findExistingUnmergedMikeProposal,
  recordEscalatedResult,
  recordLowRiskResult,
  selectEscalationCandidate,
  statusFromOutcome,
} from "../../scripts/lib/mike-sync.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const policy = JSON.parse(read("config/upstream-mike-sync-policy.v1.json"));

test("Mike Sync v2 records explicit capability outcomes and preserves legacy mappings", () => {
  assert.equal(decisionFromOutcome("adapted"), "adapt");
  assert.equal(decisionFromOutcome("equivalent"), "skip");
  assert.equal(decisionFromOutcome("deferred"), "skip");
  assert.equal(decisionFromOutcome("needs-test-harness"), "investigate");
  assert.equal(statusFromOutcome("retryable"), "retryable");
  assert.equal(statusFromOutcome("needs-decision"), "needs-decision");
  assert.equal(statusFromOutcome("incompatible"), "terminal");
  assert.equal(policy.implementation_candidates_per_branch, 1);
  assert.equal(policy.merge_controls.exact_head_baseline_required, true);
});

test("low-risk state records one window without losing capability metadata", () => {
  const state = {
    schema_version: 2,
    last_merged_at: "2026-08-01T00:00:00Z",
    processed: [],
  };
  const window = [{
    number: 300,
    title: "Improve loading state",
    url: "https://github.com/Open-Legal-Products/mike/pull/300",
    merged_at: "2026-08-04T00:00:00Z",
    merge_commit_sha: "abc",
  }];
  const result = {
    entries: [{
      number: 300,
      decision: "investigate",
      outcome: "needs-test-harness",
      capability: "loading-state-a11y",
      series_id: "ui-foundation",
      dependencies: ["mike-pr-299"],
      prerequisites: ["focused frontend accessibility harness"],
      reason: "Useful but the current harness cannot verify the keyboard behavior.",
      next_review_at: "2026-08-11T00:00:00Z",
    }],
  };

  recordLowRiskResult(state, window, result, "2026-08-04T12:00:00Z");
  assert.equal(state.schema_version, 3);
  assert.equal(state.processed[0].outcome, "needs-test-harness");
  assert.equal(state.processed[0].status, "retryable");
  assert.equal(state.processed[0].capability, "loading-state-a11y");
  assert.deepEqual(state.processed[0].dependencies, ["mike-pr-299"]);
  assert.deepEqual(state.metrics.by_status, { retryable: 1 });
});

test("legacy deferred entries stay closed by default and can be reopened deliberately", () => {
  const low = {
    processed: [{
      number: 301,
      title: "Protected capability",
      merged_at: "2026-08-02T00:00:00Z",
      decision: "investigate",
    }],
  };
  const escalation = {
    processed: [{
      number: 301,
      risk: "defer",
      reason: "Legacy terminal decision",
      processed_at: "2026-08-03T00:00:00Z",
    }],
  };

  assert.equal(selectEscalationCandidate(low, escalation), null);
  assert.equal(
    selectEscalationCandidate(low, escalation, {
      reconsiderDeferred: true,
      numbers: [301],
    }).number,
    301,
  );
  assert.equal(
    selectEscalationCandidate(low, escalation, {
      reconsiderAllDeferred: true,
    }).number,
    301,
  );
  assert.equal(
    selectEscalationCandidate(low, escalation, {
      reconsiderAllDeferred: true,
      numbers: [""],
    }).number,
    301,
  );
  escalation.processed[0] = {
    ...escalation.processed[0],
    outcome: "deferred",
    status: "terminal",
    attempts: 1,
    v2_attempted_at: "2026-08-04T12:00:00Z",
  };
  assert.equal(
    selectEscalationCandidate(low, escalation, {
      reconsiderAllDeferred: true,
    }),
    null,
  );
});

test("escalated retryable results retain history and become due queue entries", () => {
  const state = {
    schema_version: 1,
    processed: [{
      number: 302,
      risk: "defer",
      reason: "Legacy classification",
      processed_at: "2026-08-03T00:00:00Z",
    }],
  };
  const item = {
    number: 302,
    title: "Add a bounded capability",
    url: "https://github.com/Open-Legal-Products/mike/pull/302",
    merged_at: "2026-08-02T00:00:00Z",
    merge_commit_sha: "def",
    decision: "investigate",
  };
  recordEscalatedResult(state, item, {
    entries: [{
      number: 302,
      decision: "investigate",
      outcome: "needs-test-harness",
      risk: "medium",
      capability: "bounded-capability",
      series_id: null,
      dependencies: [],
      prerequisites: ["focused backend harness"],
      reason: "The implementation is plausible but cannot yet be verified.",
      architecture_brief: null,
      implementation_plan: [],
      next_review_at: "2026-08-11T00:00:00Z",
    }],
  }, "2026-08-04T12:00:00Z");

  const record = state.processed[0];
  assert.equal(record.attempts, 1);
  assert.equal(record.outcome, "needs-test-harness");
  assert.equal(record.status, "retryable");
  assert.equal(record.history.length, 2);
  assert.equal(record.history.at(-1).outcome, "needs-test-harness");
  assert.equal(
    selectEscalationCandidate({ processed: [item] }, state, { now: "2026-08-12T00:00:00Z" }).number,
    302,
  );
});

test("unmerged automated proposals suppress duplicate escalation records", () => {
  const proposals = [
    {
      number: 105,
      state: "open",
      merged_at: null,
      body: "Automated-Upstream-Mike-Sync: true\n\n## Mike PR #256",
    },
    {
      number: 106,
      state: "closed",
      merged_at: null,
      body: "Automated-Upstream-Mike-Sync: true\n\n## Mike PR #256",
    },
    {
      number: 107,
      state: "closed",
      merged_at: "2026-08-12T00:00:00Z",
      body: "Automated-Upstream-Mike-Sync: true\n\n## Mike PR #256",
    },
    {
      number: 108,
      state: "open",
      merged_at: null,
      body: "Human PR\n\n## Mike PR #256",
    },
  ];

  assert.equal(findExistingUnmergedMikeProposal(proposals, 256)?.number, 105);
  assert.equal(findExistingUnmergedMikeProposal(proposals, 999), null);
});

test("workflow boundaries expose the deliberate deferred pass and bounded repair", () => {
  const workflow = read(".github/workflows/sync-upstream-mike-escalated.yml");
  assert.match(workflow, /reconsider_all_deferred:/);
  assert.match(workflow, /one controlled v2 pass over every legacy deferred Mike PR/);
  assert.match(workflow, /v2_attempted_at/);
  assert.match(workflow, /bounded repair attempt/);
  assert.match(workflow, /["']maxItems["']:\s*1/);
  assert.match(workflow, /High-risk or security-sensitive work/);
  assert.match(workflow, /draft state-only architecture record/);
});
