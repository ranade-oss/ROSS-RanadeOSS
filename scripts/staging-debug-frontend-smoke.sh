#!/usr/bin/env bash

set -euo pipefail
for name in CANDIDATE_WEB_IMAGE API_APP WEB_APP ROSS_STAGING_DEBUG_RELEASE_ID; do
  if [ -z "${!name:-}" ]; then echo "Missing frontend smoke value: $name" >&2; exit 2; fi
done

container="ross-staging-debug-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
cleanup() { docker rm --force "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
cleanup
docker run --detach --name "$container" --publish 127.0.0.1::3000 \
  --env "ROSS_RUNTIME_API_BASE_URL=https://${API_APP}.fly.dev" \
  --env "ROSS_RUNTIME_APP_URL=https://${WEB_APP}.fly.dev" \
  --env ROSS_RUNTIME_SIGNUPS_ENABLED=false \
  --env ROSS_RUNTIME_ENVIRONMENT=rehearsal \
  --env "ROSS_RUNTIME_RELEASE_ID=${ROSS_STAGING_DEBUG_RELEASE_ID}" \
  "$CANDIDATE_WEB_IMAGE" >/dev/null

port="$(docker port "$container" 3000/tcp | sed -nE 's/.*:([0-9]+)$/\1/p')"
if ! [[ "$port" =~ ^[0-9]+$ ]]; then echo "Candidate frontend did not publish port 3000." >&2; exit 1; fi
base="http://127.0.0.1:${port}"
for attempt in {1..30}; do
  if curl --fail --silent --show-error "$base/login" >/dev/null; then break; fi
  if [ "$attempt" -eq 30 ]; then docker logs "$container" >&2; exit 1; fi
  sleep 2
done
curl --fail --silent --show-error "$base/api/runtime-config" \
  | tee artifacts/staging-debug/diagnostics/frontend-image-runtime-config.json \
  | jq -e --arg api "https://${API_APP}.fly.dev" \
      --arg app "https://${WEB_APP}.fly.dev" \
      --arg release "$ROSS_STAGING_DEBUG_RELEASE_ID" \
      '.apiBaseUrl == $api and .appUrl == $app and .releaseId == $release and .environment == "rehearsal" and .signupsEnabled == false' \
  >/dev/null
