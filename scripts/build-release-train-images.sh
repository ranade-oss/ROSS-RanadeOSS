#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  FLY_API_TOKEN
  ROSS_SUPABASE_URL
  ROSS_SUPABASE_PUBLISHABLE_KEY
  ROSS_RELEASE_ID
  GITHUB_SHA
  GITHUB_RUN_ID
  GITHUB_RUN_ATTEMPT
)
for name in "${required[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "Required release-train value is missing: ${name}" >&2
    exit 2
  fi
done

# Production releases retain the historical defaults. Staging-debug callers
# must supply isolated registry and runtime app names explicitly, without
# masquerading as production through PROD_* variables.
image_api_app="${RELEASE_IMAGE_API_APP:-${PROD_API_APP:-}}"
image_web_app="${RELEASE_IMAGE_WEB_APP:-${PROD_WEB_APP:-}}"
image_worker_app="${RELEASE_IMAGE_WORKER_APP:-${PROD_WORKER_APP:-}}"
runtime_api_app="${RELEASE_RUNTIME_API_APP:-${PROD_API_APP:-}}"
runtime_web_app="${RELEASE_RUNTIME_WEB_APP:-${PROD_WEB_APP:-}}"
rehearsal_api_app="${RELEASE_REHEARSAL_API_APP:-${STAGE_API_APP:-}}"
for item in \
  "RELEASE_IMAGE_API_APP:${image_api_app}" \
  "RELEASE_IMAGE_WEB_APP:${image_web_app}" \
  "RELEASE_IMAGE_WORKER_APP:${image_worker_app}" \
  "RELEASE_RUNTIME_API_APP:${runtime_api_app}" \
  "RELEASE_RUNTIME_WEB_APP:${runtime_web_app}" \
  "RELEASE_REHEARSAL_API_APP:${rehearsal_api_app}"; do
  name="${item%%:*}"
  value="${item#*:}"
  if [ -z "$value" ]; then
    echo "Required release image value is missing: ${name}" >&2
    exit 2
  fi
done

mkdir -p artifacts/release-train-build
flyctl auth docker >/dev/null

build_attempts="${FLY_BUILD_ATTEMPTS:-3}"
if ! [[ "$build_attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "FLY_BUILD_ATTEMPTS must be a positive integer." >&2
  exit 2
fi

short_sha="${GITHUB_SHA:0:12}"
label_base="ross-${short_sha}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"

api_tag="registry.fly.io/${image_api_app}:${label_base}-api"
web_tag="registry.fly.io/${image_web_app}:${label_base}-web"
worker_tag="registry.fly.io/${image_worker_app}:${label_base}-worker"

build_api() {
  flyctl deploy . \
    --config deploy/fly/api.toml \
    --app "$image_api_app" \
    --build-only \
    --push \
    --remote-only \
    --no-cache \
    --image-label "${label_base}-api" \
    --build-arg "ROSS_BUILD_RELEASE_ID=${ROSS_RELEASE_ID}"
}

build_worker() {
  flyctl deploy . \
    --config deploy/fly/file-worker.toml \
    --app "$image_worker_app" \
    --build-only \
    --push \
    --remote-only \
    --no-cache \
    --image-label "${label_base}-worker"
}

build_web() {
  flyctl deploy . \
    --config deploy/fly/frontend.toml \
    --app "$image_web_app" \
    --build-only \
    --push \
    --remote-only \
    --no-cache \
    --image-label "${label_base}-web" \
    --build-arg "NEXT_PUBLIC_SUPABASE_URL=${ROSS_SUPABASE_URL}" \
    --build-arg "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=${ROSS_SUPABASE_PUBLISHABLE_KEY}" \
    --build-arg "NEXT_PUBLIC_API_BASE_URL=https://${runtime_api_app}.fly.dev" \
    --build-arg "NEXT_PUBLIC_REHEARSAL_API_BASE_URL=https://${rehearsal_api_app}.fly.dev" \
    --build-arg "NEXT_PUBLIC_ROSS_APP_URL=https://${runtime_web_app}.fly.dev" \
    --build-arg "NEXT_PUBLIC_ROSS_WEBSITE_URL=https://ross-ontario.augustmaat.chatgpt.site" \
    --build-arg "NEXT_PUBLIC_ROSS_HOSTED_MODE=controlled-beta" \
    --build-arg "NEXT_PUBLIC_ROSS_DATA_BOUNDARY_VERSION=2026-09-03-provider-responsibility" \
    --build-arg "NEXT_PUBLIC_ROSS_TERMS_VERSION=2026-09-03-provider-responsibility" \
    --build-arg "NEXT_PUBLIC_ROSS_PRIVACY_VERSION=2026-09-03-provider-responsibility" \
    --build-arg "NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED=${RELEASE_SIGNUPS_ENABLED:-true}" \
    --build-arg "ROSS_BUILD_RELEASE_ID=${ROSS_RELEASE_ID}"
}

retry_build() {
  local component="$1"
  local build_function="$2"
  local attempt
  for ((attempt = 1; attempt <= build_attempts; attempt += 1)); do
    echo "Starting ${component} image build attempt ${attempt} of ${build_attempts}."
    if "$build_function"; then
      return 0
    fi
    if ((attempt < build_attempts)); then
      sleep $((attempt * 10))
    fi
  done
  return 1
}

retry_build api build_api >artifacts/release-train-build/api.log 2>&1 &
api_pid=$!
retry_build worker build_worker >artifacts/release-train-build/worker.log 2>&1 &
worker_pid=$!
retry_build web build_web >artifacts/release-train-build/web.log 2>&1 &
web_pid=$!

failed=0
for item in "api:${api_pid}" "worker:${worker_pid}" "web:${web_pid}"; do
  component="${item%%:*}"
  pid="${item##*:}"
  if ! wait "$pid"; then
    echo "${component} image build failed." >&2
    failed=1
  fi
done

for component in api worker web; do
  echo "Build log: ${component}"
  sed -E \
    -e 's/(ROSS_SUPABASE_PUBLISHABLE_KEY|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)=[^ ]+/\1=***masked***/g' \
    "artifacts/release-train-build/${component}.log"
done
if [ "$failed" -ne 0 ]; then
  exit 1
fi

resolve_image() {
  local tag="$1"
  local attempt
  local reference
  for attempt in 1 2 3 4 5 6; do
    if reference="$(node scripts/release-train-image-ref.mjs resolve "$tag")"; then
      printf '%s\n' "$reference"
      return 0
    fi
    if ((attempt < 6)); then
      sleep 5
    fi
  done
  return 1
}

api_ref="$(resolve_image "$api_tag")"
worker_ref="$(resolve_image "$worker_tag")"
web_ref="$(resolve_image "$web_tag")"

env_file="${GITHUB_ENV:-artifacts/release-train-images.env}"
output_file="${GITHUB_OUTPUT:-artifacts/release-train-images.outputs}"
{
  echo "CANDIDATE_API_IMAGE=${api_ref}"
  echo "CANDIDATE_WEB_IMAGE=${web_ref}"
  echo "CANDIDATE_WORKER_IMAGE=${worker_ref}"
} >> "$env_file"
{
  echo "api_image=${api_ref}"
  echo "web_image=${web_ref}"
  echo "worker_image=${worker_ref}"
} >> "$output_file"

echo "Built and pinned all candidate images by immutable digest."
echo "API: ${api_ref}"
echo "Worker: ${worker_ref}"
echo "Web: ${web_ref}"
