const DAY_MS = 24 * 60 * 60 * 1000;

export const MIKE_SYNC_POLICY = "v2";

export const V2_OUTCOMES = Object.freeze([
  "adopted",
  "adapted",
  "equivalent",
  "superseded",
  "incompatible",
  "deferred",
  "retryable",
  "needs-test-harness",
  "needs-decision",
]);

export const RETRYABLE_OUTCOMES = new Set([
  "retryable",
  "needs-test-harness",
]);

export const TERMINAL_OUTCOMES = new Set([
  "adopted",
  "adapted",
  "equivalent",
  "superseded",
  "incompatible",
  "deferred",
]);

const DECISIONS = new Set(["adopt", "adapt", "skip", "investigate"]);
const RISKS = new Set(["none", "medium", "high"]);

export function isAutomatedMikeProposalFor(pr, number) {
  if (!pr || !Number.isSafeInteger(number)) return false;
  const body = typeof pr.body === "string" ? pr.body : "";
  return /(?:^|\r?\n)Automated-Upstream-Mike-Sync:\s*true(?:\r?\n|$)/.test(body)
    && new RegExp("\\bMike PR #" + number + "\\b", "i").test(body);
}

export function findExistingUnmergedMikeProposal(prs, number) {
  if (!Array.isArray(prs)) return null;
  return prs.find((pr) => isAutomatedMikeProposalFor(pr, number) && !pr.merged_at) || null;
}

export function outcomeFromLegacyDecision(decision) {
  switch (decision) {
    case "adopt":
      return "adopted";
    case "adapt":
      return "adapted";
    case "skip":
      return "equivalent";
    case "investigate":
      return "needs-decision";
    default:
      return "deferred";
  }
}

export function decisionFromOutcome(outcome) {
  switch (outcome) {
    case "adopted":
      return "adopt";
    case "adapted":
      return "adapt";
    case "retryable":
    case "needs-test-harness":
    case "needs-decision":
      return "investigate";
    default:
      return "skip";
  }
}

export function statusFromOutcome(outcome) {
  if (RETRYABLE_OUTCOMES.has(outcome)) return "retryable";
  if (outcome === "needs-decision") return "needs-decision";
  if (TERMINAL_OUTCOMES.has(outcome)) return "terminal";
  return "retryable";
}

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

function safeDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function defaultRetryDate(now, days = 7) {
  return new Date(Date.parse(now) + days * DAY_MS).toISOString();
}

export function normalizeSyncEntry(raw, { source = "low-risk" } = {}) {
  if (!raw || !Number.isInteger(raw.number)) {
    throw new Error("Every Mike synchronization entry requires an integer number.");
  }

  const decision = text(raw.decision);
  if (decision && !DECISIONS.has(decision)) {
    throw new Error(`Unsupported Mike synchronization decision: ${decision}`);
  }

  const inferred = outcomeFromLegacyDecision(decision || "investigate");
  const outcome = text(raw.outcome, inferred);
  if (!V2_OUTCOMES.includes(outcome)) {
    throw new Error(`Unsupported Mike synchronization outcome: ${outcome}`);
  }

  const risk = text(raw.risk, source === "low-risk" ? "none" : "none");
  if (!RISKS.has(risk)) {
    throw new Error(`Unsupported Mike synchronization risk: ${risk}`);
  }

  const normalizedDecision = decision || decisionFromOutcome(outcome);
  const expectedDecision = decisionFromOutcome(outcome);
  if (normalizedDecision !== expectedDecision) {
    throw new Error(
      `Decision ${normalizedDecision} does not match outcome ${outcome} for Mike PR #${raw.number}.`,
    );
  }

  const status = text(raw.status, statusFromOutcome(outcome));
  if (!["terminal", "retryable", "needs-decision"].includes(status)) {
    throw new Error(`Unsupported Mike synchronization status: ${status}`);
  }

  return {
    number: raw.number,
    decision: normalizedDecision,
    outcome,
    status,
    risk,
    capability: text(raw.capability, `mike-pr-${raw.number}`),
    series_id: text(raw.series_id) || null,
    dependencies: stringList(raw.dependencies),
    prerequisites: stringList(raw.prerequisites),
    reason: text(raw.reason, "No synchronization reason was supplied."),
    architecture_brief: text(raw.architecture_brief) || null,
    implementation_plan: stringList(raw.implementation_plan),
    next_review_at: safeDate(raw.next_review_at),
  };
}

export function summarizeOutcomes(entries = []) {
  const byOutcome = {};
  const byStatus = {};
  const byRisk = {};
  for (const entry of entries) {
    const outcome = entry.outcome || outcomeFromLegacyDecision(entry.decision);
    const status = entry.status || statusFromOutcome(outcome);
    const risk = entry.risk || "none";
    byOutcome[outcome] = (byOutcome[outcome] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
    byRisk[risk] = (byRisk[risk] || 0) + 1;
  }
  return { by_outcome: byOutcome, by_status: byStatus, by_risk: byRisk };
}

function sourceMetadata(item) {
  return {
    number: item.number,
    title: text(item.title, `Mike PR #${item.number}`),
    url: text(item.url, `https://github.com/Open-Legal-Products/mike/pull/${item.number}`),
    merged_at: safeDate(item.merged_at) || item.merged_at || null,
    merge_commit_sha: text(item.merge_commit_sha) || null,
  };
}

export function recordLowRiskResult(state, window, result, now = new Date().toISOString()) {
  if (!state || !Array.isArray(window) || !result || !Array.isArray(result.entries)) {
    throw new Error("Cannot record an invalid low-risk Mike synchronization result.");
  }
  const entriesByNumber = new Map(result.entries.map((entry) => [entry.number, entry]));
  const existing = new Set((state.processed || []).map((entry) => entry.number));
  const appended = [];

  for (const item of window) {
    const raw = entriesByNumber.get(item.number);
    if (!raw) throw new Error(`Missing low-risk classification for Mike PR #${item.number}.`);
    const entry = normalizeSyncEntry(raw, { source: "low-risk" });
    if (existing.has(item.number)) continue;
    appended.push({
      ...sourceMetadata(item),
      ...entry,
      processed_at: now,
    });
  }

  state.schema_version = Math.max(Number(state.schema_version) || 0, 3);
  state.policy = MIKE_SYNC_POLICY;
  state.processed = [...(state.processed || []), ...appended].slice(-500);
  if (window.length > 0) {
    const last = window.at(-1);
    state.last_merged_at = last.merged_at;
  }
  state.metrics = summarizeOutcomes(state.processed);
  return state;
}

function entryHistory(record) {
  if (!record) return [];
  return Array.isArray(record.history) ? record.history : [{
    outcome: record.outcome || (record.risk === "defer" ? "deferred" : "needs-decision"),
    status: record.status || (record.risk === "defer" ? "terminal" : "needs-decision"),
    risk: record.risk || "none",
    reason: record.reason || "Legacy Mike synchronization record.",
    processed_at: record.processed_at || null,
  }];
}

export function recordEscalatedResult(state, item, result, now = new Date().toISOString()) {
  if (!state || !item || !result || !Array.isArray(result.entries)) {
    throw new Error("Cannot record an invalid escalated Mike synchronization result.");
  }
  const raw = result.entries.find((entry) => entry.number === item.number);
  if (!raw) throw new Error(`Missing escalated classification for Mike PR #${item.number}.`);
  const entry = normalizeSyncEntry(raw, { source: "escalated" });
  const processed = [...(state.processed || [])];
  const index = processed.findIndex((candidate) => candidate.number === item.number);
  const previous = index >= 0 ? processed[index] : null;
  const attempts = Number(previous?.attempts || 0) + 1;
  const nextReview = entry.status === "retryable"
    ? entry.next_review_at || defaultRetryDate(now)
    : entry.status === "needs-decision"
      ? null
      : null;
  const record = {
    ...sourceMetadata(item),
    ...entry,
    policy: MIKE_SYNC_POLICY,
    attempts,
    first_processed_at: previous?.first_processed_at || now,
    processed_at: now,
    v2_attempted_at: now,
    next_review_at: nextReview,
    history: [
      ...entryHistory(previous),
      {
        outcome: entry.outcome,
        status: entry.status,
        risk: entry.risk,
        reason: entry.reason,
        processed_at: now,
      },
    ].slice(-10),
  };

  if (index >= 0) processed[index] = record;
  else processed.push(record);
  state.schema_version = Math.max(Number(state.schema_version) || 0, 2);
  state.policy = MIKE_SYNC_POLICY;
  state.processed = processed.slice(-500);
  state.metrics = summarizeOutcomes(state.processed);
  return state;
}

function recordIsEligible(record, nowMs) {
  if (!record) return true;
  const outcome = record.outcome || (record.risk === "defer" ? "deferred" : null);
  const status = record.status || statusFromOutcome(outcome || "deferred");
  if (status !== "retryable") return false;
  const next = Date.parse(record.next_review_at || "");
  return Number.isNaN(next) || next <= nowMs;
}

function explicitNumbers(values) {
  return new Set(
    values
      .filter((value) => !(typeof value === "string" && value.trim() === ""))
      .map((value) => Number(value))
      .filter(Number.isSafeInteger),
  );
}

export function selectEscalationCandidate(
  lowState,
  escalationState,
  {
    now = new Date().toISOString(),
    reconsiderDeferred = false,
    reconsiderAllDeferred = false,
    numbers = [],
  } = {},
) {
  const explicit = explicitNumbers(numbers);
  const records = new Map((escalationState?.processed || []).map((entry) => [entry.number, entry]));
  const nowMs = Date.parse(now);
  const candidates = (lowState?.processed || [])
    .filter((entry) => entry.decision === "investigate")
    .filter((entry) => explicit.size === 0 || explicit.has(entry.number))
    .sort((left, right) => {
      const time = Date.parse(left.merged_at || "") - Date.parse(right.merged_at || "");
      return (Number.isNaN(time) ? 0 : time) || left.number - right.number;
    });

  for (const candidate of candidates) {
    const record = records.get(candidate.number);
    if (reconsiderAllDeferred) {
      if (!record) continue;
      const outcome = record.outcome || (record.risk === "defer" ? "deferred" : null);
      if (outcome === "deferred" && !record.v2_attempted_at && !(record.history?.length > 1)) return candidate;
      continue;
    }
    if (!record) return candidate;
    const outcome = record.outcome || (record.risk === "defer" ? "deferred" : null);
    if (
      reconsiderDeferred &&
      explicit.has(candidate.number) &&
      outcome === "deferred"
    ) {
      return candidate;
    }
    if (recordIsEligible(record, nowMs)) return candidate;
  }
  return null;
}

export function markResultRetryable(result, number, reason, now = new Date().toISOString()) {
  const nextReview = defaultRetryDate(now);
  const entries = (result.entries || []).map((entry) => {
    if (entry.number !== number) return entry;
    return {
      ...entry,
      decision: "investigate",
      outcome: "retryable",
      status: "retryable",
      risk: entry.risk === "high" ? "high" : entry.risk === "medium" ? "medium" : "none",
      reason: text(reason, "The bounded synchronization attempt needs new evidence before retrying."),
      next_review_at: nextReview,
    };
  });
  return {
    ...result,
    entries,
    apply_number: null,
    patch: "",
    highest_risk: "none",
    title: "Record retryable upstream Mike synchronization work",
    summary: "No code was recorded because the bounded candidate attempt needs new evidence before it is retried.",
  };
}

export function assertSingleImplementationCandidate(entries) {
  const implementation = entries.filter((entry) => ["adopt", "adapt"].includes(entry.decision));
  if (implementation.length > 1) {
    throw new Error("Mike Sync v2 permits at most one implementation candidate per branch.");
  }
  return implementation[0] || null;
}
