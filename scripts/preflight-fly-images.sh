#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to preflight the Fly deployment images." >&2
  exit 127
fi

docker info >/dev/null

echo "Preflighting the API build stage."
docker build \
  --progress=plain \
  --file deploy/fly/backend.Dockerfile \
  --target build \
  .

echo "Preflighting the private file-worker build stage."
docker build \
  --progress=plain \
  --file deploy/fly/file-worker.Dockerfile \
  --target build \
  .

echo "Preflighting the complete public frontend image."
docker build \
  --progress=plain \
  --file deploy/fly/frontend.Dockerfile \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://synthetic-build.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=synthetic-build-key \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.invalid \
  --build-arg NEXT_PUBLIC_REHEARSAL_API_BASE_URL=https://rehearsal-api.example.invalid \
  --build-arg NEXT_PUBLIC_ROSS_APP_URL=https://app.example.invalid \
  --build-arg NEXT_PUBLIC_ROSS_WEBSITE_URL=https://website.example.invalid \
  --build-arg NEXT_PUBLIC_ROSS_HOSTED_MODE=controlled-beta \
  --build-arg NEXT_PUBLIC_ROSS_DATA_BOUNDARY_VERSION=2026-07-17-public-beta \
  --build-arg NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED=true \
  --build-arg NEXT_PUBLIC_ROSS_TERMS_VERSION=2026-07-17-public-beta \
  --build-arg NEXT_PUBLIC_ROSS_PRIVACY_VERSION=2026-07-17-public-beta \
  --build-arg ROSS_BUILD_RELEASE_ID=ross-public-beta-20260726-rc999 \
  .

echo "PASS: all Fly build paths and the complete public frontend image are buildable."
