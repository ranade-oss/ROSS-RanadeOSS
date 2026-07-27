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
  local baseline_image failure_config deploy_status failure_log
  baseline_image="$(node scripts/release-train-image-ref.mjs current "$WEB_APP")"
  printf '%s\n' "$baseline_image" > "$ARTIFACT_DIR/diagnostics/web-restore-image.txt"

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
  failure_log="$ARTIFACT_DIR/commands/web-forced-failure.log"
  if grep -Eqi 'unauthori[sz]ed|authentication|permission denied|forbidden|network|timeout|connection refused|could not resolve' "$failure_log"; then
    echo "Forced deployment failed for authentication, permission, or network reasons, not the expected health check." >&2
    exit 1
  fi
  if ! grep -Eqi 'health check|service check|unhealthy|failed to become healthy' "$failure_log"; then
    echo "Forced deployment did not contain evidence of the expected Fly health-check failure." >&2
    exit 1
  fi
  printf '{"outcome":"expected-failure","cause":"fly-health-check","exitCode":%d}\n' \
    "$deploy_status" > "$ARTIFACT_DIR/diagnostics/forced-failure-result.json"
  flyctl status --app "$WEB_APP" --json \
    > "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy-status.json" 2>&1 || true
  flyctl logs --app "$WEB_APP" --no-tail \
    > "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy.log" 2>&1 || true

  bash scripts/fly-deploy-with-retry.sh . \
    --config deploy/fly/rehearsal-frontend.toml --app "$WEB_APP" \
    --image "$baseline_image" --ha=false --yes --flycast --no-public-ips \
    2>&1 | tee "$ARTIFACT_DIR/commands/web-digest-restore.log"
  node scripts/release-train-image-ref.mjs verify "$WEB_APP" "$baseline_image" \
    > "$ARTIFACT_DIR/diagnostics/web-restored-image.txt"
  printf '{"outcome":"passed","recordedDigest":"%s","restoredDigest":"%s"}\n' \
    "$baseline_image" "$(cat "$ARTIFACT_DIR/diagnostics/web-restored-image.txt")" \
    > "$ARTIFACT_DIR/diagnostics/digest-restoration-result.json"
}

cleanup() {
  local failed=0 app output status
  for app in "${WORKER_APP:-}" "${API_APP:-}" "${WEB_APP:-}"; do
    [ -n "$app" ] || continue
    set +e
    output="$(flyctl apps destroy "$app" --yes 2>&1)"
    status=$?
    set -e
    printf '%s\n' "$output" > "$ARTIFACT_DIR/commands/cleanup-${app}.log"
    if [ "$status" -eq 0 ]; then
      continue
    fi
    if printf '%s\n' "$output" | grep -Eqi \
      'app(lication)? (was )?not found|could not find app|does not exist|404'; then
      printf 'App %s was not provisioned; nothing to destroy.\n' "$app" \
        > "$ARTIFACT_DIR/commands/cleanup-${app}.log"
      continue
    fi
    printf 'Failed to destroy %s (flyctl exit %d).\n' "$app" "$status" >&2
    failed=1
  done
  if [ "$failed" -ne 0 ]; then
    printf '{"outcome":"failed"}\n' > "$ARTIFACT_DIR/cleanup-result.json"
    echo "Ephemeral cleanup failed; operator action required." >&2
    exit 1
  fi
  printf '{"outcome":"passed"}\n' > "$ARTIFACT_DIR/cleanup-result.json"
}

case "${1:-}" in
  inject-failure-and-rollback) inject_failure_and_rollback ;;
  cleanup) cleanup ;;
  *) echo "Usage: staging-debug-lifecycle.sh inject-failure-and-rollback | cleanup" >&2; exit 2 ;;
esac
