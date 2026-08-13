#!/usr/bin/env bash
set -euo pipefail

branch="${1:?branch is required}"
pr_number="${2:?pull request number is required}"
head_sha="$(git rev-parse HEAD)"
output_file="${GITHUB_OUTPUT:-}"

set_output() {
  if [ -n "$output_file" ]; then
    printf '%s=%s\n' "$1" "$2" >> "$output_file"
  fi
}

set_output merged false

echo "Dispatching exact-head Baseline for ${branch} (${head_sha})."
gh workflow run baseline.yml --ref "$branch"

baseline_run_id=""
for _ in $(seq 1 30); do
  baseline_run_id="$(gh run list --workflow baseline.yml --branch "$branch" --limit 50 --json databaseId,headSha | jq -r --arg sha "$head_sha" 'map(select(.headSha == $sha)) | first | .databaseId // empty')"
  if [ -n "$baseline_run_id" ]; then break; fi
  sleep 2
done

if [ -z "$baseline_run_id" ]; then
  echo "::notice::Baseline dispatch was accepted but its exact run ID was not observable; leaving PR #${pr_number} pending for reconciliation."
  exit 0
fi

echo "Baseline run ${baseline_run_id} is attached to exact head ${head_sha}."
baseline_deadline=$((SECONDS + 900))
baseline_status=""
baseline_conclusion=""
while [ "$SECONDS" -lt "$baseline_deadline" ]; do
  run="$(gh run view "$baseline_run_id" --json status,conclusion,headSha)"
  baseline_status="$(jq -r '.status' <<<"$run")"
  baseline_conclusion="$(jq -r '.conclusion // empty' <<<"$run")"
  if [ "$baseline_status" = "completed" ]; then break; fi
  sleep 10
done

if [ "$baseline_status" != "completed" ]; then
  echo "::notice::Baseline run ${baseline_run_id} did not complete within the bounded handoff window; leaving PR #${pr_number} pending."
  exit 0
fi

echo "Baseline run ${baseline_run_id} completed with conclusion ${baseline_conclusion}."
if ! gh workflow run handle-baseline-result.yml --ref main -f baseline_run_id="$baseline_run_id"; then
  echo "::notice::Could not dispatch the existing Baseline-result gate for run ${baseline_run_id}; leaving PR #${pr_number} pending."
  exit 0
fi

merge_deadline=$((SECONDS + 600))
while [ "$SECONDS" -lt "$merge_deadline" ]; do
  pr="$(gh pr view "$pr_number" --json state,mergedAt)"
  merged_at="$(jq -r '.mergedAt // empty' <<<"$pr")"
  state="$(jq -r '.state' <<<"$pr")"
  if [ -n "$merged_at" ]; then
    echo "Synchronization PR #${pr_number} merged at ${merged_at}."
    set_output merged true
    exit 0
  fi
  if [ "$state" != "OPEN" ]; then
    echo "::notice::Synchronization PR #${pr_number} closed without merging; reconciliation remains authoritative."
    exit 0
  fi
  sleep 10
done

echo "::notice::Synchronization PR #${pr_number} is still pending after the bounded merge handoff window; reconciliation remains authoritative."
