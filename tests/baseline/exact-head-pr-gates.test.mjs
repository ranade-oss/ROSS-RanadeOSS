import assert from "node:assert/strict";
import test from "node:test";

import gates from "../../scripts/github/exact-head-pr-gates.cjs";

const {
  isEligibleAgentPullRequest,
  isPullRequestGateBlocked,
  resolveBaselineRun,
  resolvePullRequestForRun,
  waitForPullRequestGate,
} = gates;

const owner = "ranade-oss";
const repo = "ROSS-RanadeOSS";
const makePullRequest = (overrides = {}) => ({
  number: 42,
  state: "open",
  draft: false,
  author_association: "OWNER",
  user: { login: owner },
  body: "",
  head: {
    ref: "agent/example",
    sha: "verified-head",
    repo: { full_name: `${owner}/${repo}` },
  },
  ...overrides,
});

test("agent eligibility requires a trusted same-repository exact head", () => {
  const options = { owner, repo, verifiedHead: "verified-head" };
  assert.equal(isEligibleAgentPullRequest(makePullRequest(), options), true);
  assert.equal(
    isEligibleAgentPullRequest(makePullRequest({ draft: true }), options),
    false,
  );
  assert.equal(
    isEligibleAgentPullRequest(
      makePullRequest({ author_association: "NONE" }),
      options,
    ),
    false,
  );
  assert.equal(
    isEligibleAgentPullRequest(
      makePullRequest({
        head: {
          ref: "agent/example",
          sha: "verified-head",
          repo: { full_name: "someone/fork" },
        },
      }),
      options,
    ),
    false,
  );
  assert.equal(
    isEligibleAgentPullRequest(makePullRequest(), {
      ...options,
      verifiedHead: "different-head",
    }),
    false,
  );
});

test("only a marked Mike synchronization bot bypasses association trust", () => {
  const marked = makePullRequest({
    author_association: "NONE",
    user: { login: "github-actions[bot]" },
    body: "Automated-Upstream-Mike-Sync: true",
    head: {
      ref: "agent/upstream-sync-42",
      sha: "verified-head",
      repo: { full_name: `${owner}/${repo}` },
    },
  });
  assert.equal(isEligibleAgentPullRequest(marked, { owner, repo }), true);
  assert.equal(
    isEligibleAgentPullRequest(marked, {
      owner,
      repo,
      allowMikeSyncBot: false,
    }),
    false,
  );
});

test("workflow runs resolve only one exact open pull request", async () => {
  const linked = makePullRequest();
  const github = {
    rest: { pulls: { get: async () => ({ data: linked }), list: () => {} } },
    paginate: async () => [linked],
  };

  assert.deepEqual(
    await resolvePullRequestForRun({
      github,
      owner,
      repo,
      run: {
        event: "pull_request",
        pull_requests: [{ number: 42, head: { sha: "linked-head" } }],
      },
    }),
    { pr: linked, verifiedHead: "linked-head" },
  );

  assert.deepEqual(
    await resolvePullRequestForRun({
      github,
      owner,
      repo,
      run: {
        event: "workflow_dispatch",
        head_branch: "agent/example",
        head_sha: "verified-head",
      },
    }),
    { pr: linked, verifiedHead: "verified-head" },
  );

  github.paginate = async () => [linked, linked];
  assert.equal(
    await resolvePullRequestForRun({
      github,
      owner,
      repo,
      run: {
        event: "workflow_dispatch",
        head_branch: "agent/example",
        head_sha: "verified-head",
      },
    }),
    null,
  );
});

test("manual handler inputs resolve the requested Baseline run", async () => {
  const baseline = {
    id: 123,
    event: "workflow_dispatch",
    head_branch: "agent/example",
    head_sha: "verified-head",
    conclusion: "success",
  };
  const calls = [];
  const github = {
    rest: {
      actions: {
        getWorkflowRun: async (params) => {
          calls.push(params);
          return { data: baseline };
        },
      },
    },
  };

  assert.deepEqual(
    await resolveBaselineRun({
      github,
      owner,
      repo,
      event: { inputs: { baseline_run_id: "123" } },
    }),
    baseline,
  );
  assert.deepEqual(calls, [{ owner, repo, run_id: 123 }]);
  assert.equal(
    await resolveBaselineRun({
      github,
      owner,
      repo,
      event: { inputs: { baseline_run_id: "not-a-run" } },
    }),
    null,
  );
});

test("the gate reads every review-thread page and retries unknown mergeability", async () => {
  let calls = 0;
  const sleeps = [];
  const unknowns = [];
  const github = {
    graphql: async (_query, variables) => {
      calls += 1;
      const firstPage = variables.after === null;
      const attempt = Math.ceil(calls / 2);
      return {
        repository: {
          pullRequest: {
            state: "OPEN",
            isDraft: false,
            headRefOid: "verified-head",
            reviewDecision: "APPROVED",
            mergeable: attempt === 1 ? "UNKNOWN" : "MERGEABLE",
            reviewThreads: firstPage
              ? {
                  nodes: [{ isResolved: true }],
                  pageInfo: { hasNextPage: true, endCursor: "next" },
                }
              : {
                  nodes: [{ isResolved: true }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
          },
        },
      };
    },
  };

  const gate = await waitForPullRequestGate({
    github,
    owner,
    repo,
    number: 42,
    delayMs: 5,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    onUnknown: (attempt, attempts) => unknowns.push([attempt, attempts]),
  });

  assert.equal(calls, 4);
  assert.deepEqual(sleeps, [5]);
  assert.deepEqual(unknowns, [[1, 6]]);
  assert.equal(
    isPullRequestGateBlocked({ gate, expectedHead: "verified-head" }),
    false,
  );
});

test("the final gate fails closed for each review, head, and mergeability blocker", () => {
  const base = {
    unresolved: false,
    pullRequest: {
      state: "OPEN",
      isDraft: false,
      headRefOid: "verified-head",
      reviewDecision: "APPROVED",
      mergeable: "MERGEABLE",
    },
  };
  for (const gate of [
    { ...base, unresolved: true },
    { ...base, pullRequest: { ...base.pullRequest, state: "CLOSED" } },
    { ...base, pullRequest: { ...base.pullRequest, isDraft: true } },
    {
      ...base,
      pullRequest: { ...base.pullRequest, headRefOid: "changed-head" },
    },
    {
      ...base,
      pullRequest: {
        ...base.pullRequest,
        reviewDecision: "CHANGES_REQUESTED",
      },
    },
    {
      ...base,
      pullRequest: { ...base.pullRequest, mergeable: "UNKNOWN" },
    },
  ]) {
    assert.equal(
      isPullRequestGateBlocked({ gate, expectedHead: "verified-head" }),
      true,
    );
  }
});
