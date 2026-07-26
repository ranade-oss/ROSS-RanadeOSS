#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ARTIFACT_DIR="${ROSS_STAGING_DEBUG_ARTIFACT_DIR:-artifacts/staging-debug}"
mkdir -p "$ARTIFACT_DIR/commands" "$ARTIFACT_DIR/diagnostics"

required() {
  if [ -z "${!1:-}" ]; then
    echo "Required staging-debug value is missing: $1" >&2
    exit 2
  fi
}

inject_failure_and_rollback() {
  required WEB_APP
  required CANDIDATE_WEB_IMAGE
  local baseline_version failure_config deploy_status
  baseline_version="$(flyctl releases --app "$WEB_APP" --json \
    | tee "$ARTIFACT_DIR/diagnostics/web-releases-before-failure.json" \
    | jq -er '.[0].Version // .[0].version')"
  printf '%s\n' "$baseline_version" > "$ARTIFACT_DIR/diagnostics/web-rollback-target.txt"

  failure_config=deploy/fly/staging-debug-forced-failure.toml
  trap "rm -f '$failure_config'" EXIT
  cp deploy/fly/rehearsal-frontend.toml "$failure_config"
  sed -i 's/internal_port = 3000/internal_port = 9/' "$failure_config"
  cp "$failure_config" "$ARTIFACT_DIR/diagnostics/forced-failure.toml"

  set +e
  flyctl deploy . --config "$failure_config" --app "$WEB_APP" \
    --image "$CANDIDATE_WEB_IMAGE" --ha=false --yes --flycast \
    --no-public-ips > "$ARTIFACT_DIR/commands/web-forced-failure.log" 2>&1
  deploy_status=$?
  set -e
  if [ "$deploy_status" -eq 0 ]; then
    echo "The deliberately invalid deployment unexpectedly succeeded." >&2
    exit 1
  fi
  printf '{"expectedDeploymentFailureObserved":true,"exitCode":%d}\n' \
    "$deploy_status" > "$ARTIFACT_DIR/diagnostics/forced-failure-result.json"
  flyctl status --app "$WEB_APP" --json \
    > "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy-status.json" 2>&1 || true
  flyctl logs --app "$WEB_APP" --no-tail \
    > "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy.log" 2>&1 || true

  flyctl releases rollback "$baseline_version" --app "$WEB_APP" --yes \
    2>&1 | tee "$ARTIFACT_DIR/commands/web-rollback.log"
  flyctl releases --app "$WEB_APP" --json \
    > "$ARTIFACT_DIR/diagnostics/web-releases-after-rollback.json"
}

cleanup() {
  local failed=0 app
  for app in "${WORKER_APP:-}" "${API_APP:-}" "${WEB_APP:-}"; do
    [ -n "$app" ] || continue
    if ! flyctl status --app "$app" >/dev/null 2>&1; then
      printf 'App %s was not provisioned; nothing to destroy.\n' "$app" \
        > "$ARTIFACT_DIR/commands/cleanup-${app}.log"
      continue
    fi
    flyctl apps destroy "$app" --yes \
      > "$ARTIFACT_DIR/commands/cleanup-${app}.log" 2>&1 || failed=1
  done
  if [ "$failed" -ne 0 ]; then
    echo "Ephemeral cleanup failed; operator action required." >&2
    exit 1
  fi
}

case "${1:-}" in
  inject-failure-and-rollback) inject_failure_and_rollback ;;
  cleanup) cleanup ;;
  *) echo "Usage: staging-debug-lifecycle.sh inject-failure-and-rollback | cleanup" >&2; exit 2 ;;
esac
