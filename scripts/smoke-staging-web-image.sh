#!/usr/bin/env bash

set -euo pipefail

required() {
  if [ -z "${!1:-}" ]; then
    echo "Required candidate web smoke value is missing: $1" >&2
    exit 2
  fi
}

for name in CANDIDATE_WEB_IMAGE ROSS_STAGING_DEBUG_RELEASE_ID API_APP WEB_APP; do
  required "$name"
done

container="ross-staging-web-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
runtime_file="$(mktemp)"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -f "$runtime_file"
}
trap cleanup EXIT INT TERM

# Remove a stale runner-local container before binding the exact application
# port. The EXIT trap is unconditional for every later success or failure.
docker rm -f "$container" >/dev/null 2>&1 || true
docker pull "$CANDIDATE_WEB_IMAGE" >/dev/null
docker run --detach --name "$container" --pull never \
  --publish 127.0.0.1:3000:3000 \
  --env NODE_ENV=production --env PORT=3000 --env HOSTNAME=0.0.0.0 \
  --env "ROSS_RUNTIME_API_BASE_URL=https://${API_APP}.fly.dev" \
  --env "ROSS_RUNTIME_APP_URL=https://${WEB_APP}.fly.dev" \
  --env ROSS_RUNTIME_SIGNUPS_ENABLED=false \
  --env ROSS_RUNTIME_ENVIRONMENT=rehearsal \
  --env "ROSS_RUNTIME_RELEASE_ID=${ROSS_STAGING_DEBUG_RELEASE_ID}" \
  "$CANDIDATE_WEB_IMAGE" >/dev/null

for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 5 \
    http://127.0.0.1:3000/login >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    docker logs "$container" >&2 || true
    echo "Candidate web image did not listen on port 3000 or serve /login." >&2
    exit 1
  fi
  sleep 2
done

curl --fail --silent --show-error --max-time 5 \
  http://127.0.0.1:3000/api/runtime-config > "$runtime_file"
node - "$runtime_file" "https://${API_APP}.fly.dev" \
  "https://${WEB_APP}.fly.dev" "$ROSS_STAGING_DEBUG_RELEASE_ID" <<'NODE'
const [file, apiBaseUrl, appUrl, releaseId] = process.argv.slice(2);
const runtime = JSON.parse(require("node:fs").readFileSync(file, "utf8"));
const expected = { apiBaseUrl, appUrl, releaseId, environment: "rehearsal", signupsEnabled: false };
for (const [key, value] of Object.entries(expected)) {
  if (runtime[key] !== value) throw new Error(`Candidate runtime ${key} mismatch: ${JSON.stringify(runtime[key])}`);
}
NODE

printf 'Candidate web image %s passed runner-local port 3000, /login, and /api/runtime-config smoke checks.\n' \
  "$CANDIDATE_WEB_IMAGE"
