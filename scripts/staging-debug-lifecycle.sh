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
  local baseline_image failure_config deploy_status failure_log evidence machine_check_evidence port9_corroborated
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

  # Preserve control-plane evidence before deciding whether the expected
  # deployment failure occurred. The copied config proves what was submitted;
  # machine/check output proves how Fly evaluated it.
  flyctl machine list --app "$WEB_APP" --json \
    > "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy-machines.json" 2>&1 || true
  flyctl checks list --app "$WEB_APP" --json \
    > "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy-checks.json" 2>&1 || true
  flyctl status --app "$WEB_APP" --json \
    > "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy-status.json" 2>&1 || true
  flyctl logs --app "$WEB_APP" --no-tail \
    > "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy.log" 2>&1 || true

  grep -Eq '^  internal_port = 9$' "$ARTIFACT_DIR/diagnostics/forced-failure.toml" || {
    echo "Forced-failure evidence does not preserve deliberate internal_port = 9." >&2
    exit 1
  }
  evidence="$(cat "$failure_log" \
    "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy-machines.json" \
    "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy-checks.json" \
    "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy-status.json")"
  machine_check_evidence="$(cat \
    "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy-machines.json" \
    "$ARTIFACT_DIR/diagnostics/web-after-failed-deploy-checks.json")"
  port9_corroborated=0
  if printf '%s\n' "$machine_check_evidence" | grep -Eqi \
    'servicecheck-[^[:space:]]*-http-9|"port"[[:space:]]*:[[:space:]]*9|configured.?port[^0-9]*9'; then
    port9_corroborated=1
  fi
  if printf '%s\n' "$evidence" | grep -Eqi \
    'unauthori[sz]ed|authentication failed|permission denied|forbidden|no such host|could not resolve|control.?plane|fly api (error|unavailable)'; then
    echo "Forced deployment failed for authentication, permission, DNS, or control-plane reasons, not the expected health check." >&2
    exit 1
  fi
  # Fly's port-9 service check reports "connect: connection refused". Accept
  # transport-failure wording only when machine/check evidence identifies the
  # deliberately configured port 9. An unrelated transport failure fails closed.
  if printf '%s\n' "$evidence" | grep -Eqi 'dial tcp|connection (refused|reset)' \
    && [ "$port9_corroborated" -ne 1 ]; then
    echo "Forced deployment failed for a network reason without port-9 service-check corroboration." >&2
    exit 1
  fi
  # "timeout reached waiting for health checks to pass" is the exact expected
  # Fly wording (run 30223766400). A trailing "request canceled" is incidental.
  if ! printf '%s\n' "$evidence" | grep -Eqi \
    'timeout reached waiting for health checks to pass|health check(s)? (failed|did not pass)|service check(s)? failed|failed to become healthy|unhealthy'; then
    echo "Forced deployment did not contain evidence of the expected Fly health-check failure." >&2
    exit 1
  fi
  if [ "$port9_corroborated" -ne 1 ]; then
    echo "Fly machine/check evidence did not identify the deliberate internal_port = 9 service check." >&2
    exit 1
  fi
  if ! printf '%s\n' "$machine_check_evidence" | grep -Eqi \
    'health|unhealthy|failed|critical|connection refused'; then
    echo "Fly machine/check evidence did not corroborate the internal_port = 9 health-check failure." >&2
    exit 1
  fi
  printf '{"outcome":"expected-failure","cause":"internal-port-9-health-check","configuredInternalPort":9,"exitCode":%d}\n' \
    "$deploy_status" > "$ARTIFACT_DIR/diagnostics/forced-failure-result.json"

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
  local result_file="${ROSS_STAGING_DEBUG_CLEANUP_RESULT:-$ARTIFACT_DIR/cleanup-result.json}"
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
    printf '{"outcome":"failed"}\n' > "$result_file"
    echo "Ephemeral cleanup failed; operator action required." >&2
    exit 1
  fi
  printf '{"outcome":"passed"}\n' > "$result_file"
}

case "${1:-}" in
  inject-failure-and-rollback) inject_failure_and_rollback ;;
  cleanup) cleanup ;;
  *) echo "Usage: staging-debug-lifecycle.sh inject-failure-and-rollback | cleanup" >&2; exit 2 ;;
esac
