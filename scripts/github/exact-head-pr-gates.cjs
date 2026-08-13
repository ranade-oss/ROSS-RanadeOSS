"use strict";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

const isMarkedMikeSyncBot = (pr) =>
  pr.user?.login === "github-actions[bot]" &&
  pr.head.ref.startsWith("agent/upstream-sync-") &&
  pr.body?.includes("Automated-Upstream-Mike-Sync: true");

const isEligibleAgentPullRequest = (
  pr,
  { owner, repo, verifiedHead = null, allowMikeSyncBot = true },
) =>
  pr.state === "open" &&
  !pr.draft &&
  pr.head.repo?.full_name === `${owner}/${repo}` &&
  pr.head.ref.startsWith("agent/") &&
  (TRUSTED_ASSOCIATIONS.has(pr.author_association) ||
    (allowMikeSyncBot && isMarkedMikeSyncBot(pr))) &&
  (verifiedHead === null || pr.head.sha === verifiedHead);

const resolveBaselineRun = async ({ github, owner, repo, event }) => {
  if (event?.workflow_run) return event.workflow_run;

  const runId = Number(event?.inputs?.baseline_run_id);
  if (!Number.isSafeInteger(runId) || runId <= 0) return null;

  const { data: run } = await github.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });
  return run;
};

const resolvePullRequestForRun = async ({ github, owner, repo, run }) => {
  const linked = run.pull_requests?.[0];
  if (run.event === "pull_request" && linked) {
    const { data: pr } = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: linked.number,
    });
    return { pr, verifiedHead: linked.head.sha };
  }

  if (run.event !== "workflow_dispatch" || !run.head_branch) return null;

  const candidates = await github.paginate(github.rest.pulls.list, {
    owner,
    repo,
    state: "open",
    base: "main",
    head: `${owner}:${run.head_branch}`,
    per_page: 100,
  });
  const matches = candidates.filter(
    (pr) =>
      pr.head.repo?.full_name === `${owner}/${repo}` &&
      pr.head.ref === run.head_branch &&
      pr.head.sha === run.head_sha,
  );
  return matches.length === 1
    ? { pr: matches[0], verifiedHead: run.head_sha }
    : null;
};

const gateQuery = `
  query($owner: String!, $repo: String!, $number: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        state
        isDraft
        headRefOid
        reviewDecision
        mergeable
        reviewThreads(first: 100, after: $after) {
          nodes { isResolved }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const readPullRequestGate = async ({ github, owner, repo, number }) => {
  let after = null;
  let pullRequest = null;
  let unresolved = false;

  do {
    const result = await github.graphql(gateQuery, {
      owner,
      repo,
      number,
      after,
    });
    pullRequest = result.repository.pullRequest;
    unresolved ||= pullRequest.reviewThreads.nodes.some(
      (thread) => !thread.isResolved,
    );
    after = pullRequest.reviewThreads.pageInfo.hasNextPage
      ? pullRequest.reviewThreads.pageInfo.endCursor
      : null;
  } while (after);

  return { pullRequest, unresolved };
};

const waitForPullRequestGate = async ({
  github,
  owner,
  repo,
  number,
  attempts = 6,
  delayMs = 10_000,
  onUnknown = () => {},
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) => {
  let gate;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    gate = await readPullRequestGate({ github, owner, repo, number });
    if (gate.pullRequest.mergeable !== "UNKNOWN") return gate;
    onUnknown(attempt, attempts);
    if (attempt < attempts) await sleep(delayMs);
  }
  return gate;
};

const isPullRequestGateBlocked = ({ gate, expectedHead }) => {
  const node = gate.pullRequest;
  return (
    node.state !== "OPEN" ||
    node.isDraft ||
    node.headRefOid !== expectedHead ||
    node.reviewDecision === "CHANGES_REQUESTED" ||
    node.mergeable !== "MERGEABLE" ||
    gate.unresolved
  );
};

module.exports = {
  isEligibleAgentPullRequest,
  isPullRequestGateBlocked,
  resolveBaselineRun,
  resolvePullRequestForRun,
  waitForPullRequestGate,
};
