#!/usr/bin/env bash

set -u

attempts="${FLY_DEPLOY_ATTEMPTS:-3}"
delay_seconds="${FLY_DEPLOY_RETRY_DELAY_SECONDS:-15}"

if ! [[ "$attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "FLY_DEPLOY_ATTEMPTS must be a positive integer." >&2
  exit 2
fi

for ((attempt = 1; attempt <= attempts; attempt += 1)); do
  echo "Starting Fly deployment attempt ${attempt} of ${attempts}."
  if flyctl deploy "$@"; then
    exit 0
  fi
  if ((attempt == attempts)); then
    echo "Fly deployment failed after ${attempts} attempts." >&2
    exit 1
  fi
  echo "Fly deployment attempt ${attempt} failed; retrying in ${delay_seconds} seconds." >&2
  sleep "$delay_seconds"
done
