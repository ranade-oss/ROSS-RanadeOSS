#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TOKEN="ross-restore-$(date -u +%Y%m%d)-$(openssl rand -hex 6)"
SEED_CONTENT="ROSS isolated restore exercise ${TOKEN}"
SEED_KEY="restore-exercise/${TOKEN}.txt"
WORKDIR="$(mktemp -d /tmp/ross-restore-exercise.XXXXXX)"
REPORT="$ROOT/reports/backup-restore-exercise-2026-07-18.json"
SOURCE_SEEDED=0

cleanup() {
  local status=$?
  if [[ "$SOURCE_SEEDED" == "1" ]]; then
    node "$ROOT/backend/scripts/restore-storage-exercise.mjs" cleanup-source >/dev/null 2>&1 || true
    printf "delete from public.security_audit_events where event_type = 'restore.exercise.seed' and resource_id = :'marker';\n" |
      docker run --rm -i -e DATABASE_URL="$SOURCE_DB_URL" -e MARKER="$TOKEN" -v "$WORKDIR:/work" postgres:17-alpine \
        sh -c 'psql --variable ON_ERROR_STOP=1 --variable marker="$MARKER" --dbname "$DATABASE_URL"' \
        >/dev/null 2>&1 || true
  fi
  unset SOURCE_DB_URL TARGET_DB_URL SOURCE_S3_ACCESS_KEY_ID SOURCE_S3_SECRET_ACCESS_KEY
  unset TARGET_S3_ACCESS_KEY_ID TARGET_S3_SECRET_ACCESS_KEY TARGET_SUPABASE_SERVICE_ROLE_KEY
  case "$WORKDIR" in
    /tmp/ross-restore-exercise.*) rm -rf -- "$WORKDIR" ;;
  esac
  exit "$status"
}
trap cleanup EXIT INT TERM

prompt_secret() {
  local name="$1" label="$2" value
  read -r -s -p "$label: " value
  printf "\n"
  if [[ -z "$value" ]]; then
    printf "Missing value for %s.\n" "$label" >&2
    exit 1
  fi
  printf -v "$name" '%s' "$value"
  export "$name"
}

prompt_value() {
  local name="$1" label="$2" default="${3:-}" value
  if [[ -n "$default" ]]; then
    read -r -p "$label [$default]: " value
    value="${value:-$default}"
  else
    read -r -p "$label: " value
  fi
  if [[ -z "$value" ]]; then
    printf "Missing value for %s.\n" "$label" >&2
    exit 1
  fi
  printf -v "$name" '%s' "$value"
  export "$name"
}

prompt_db_url() {
  local name="$1" label="$2" template password value
  read -r -s -p "$label (the copied URI may still contain [YOUR-PASSWORD]): " template
  printf "\n"
  if [[ -z "$template" ]]; then
    printf "Missing value for %s.\n" "$label" >&2
    exit 1
  fi
  if [[ "$template" == *"[YOUR-PASSWORD]"* ]]; then
    read -r -s -p "Database password for this URI: " password
    printf "\n"
    if [[ -z "$password" ]]; then
      printf "Missing database password.\n" >&2
      exit 1
    fi
    value="$(URL_TEMPLATE="$template" URL_PASSWORD="$password" node -e \
      'process.stdout.write(process.env.URL_TEMPLATE.replace("[YOUR-PASSWORD]", encodeURIComponent(process.env.URL_PASSWORD)))')"
    unset password URL_TEMPLATE URL_PASSWORD
  else
    value="$template"
  fi
  printf -v "$name" '%s' "$value"
  export "$name"
}

printf "ROSS isolated Supabase backup/restore exercise\n"
printf "Secrets are read without echo and are not written to the report.\n\n"

command -v docker >/dev/null || { printf "Docker is required.\n" >&2; exit 1; }
command -v node >/dev/null || { printf "Node.js is required.\n" >&2; exit 1; }
docker info >/dev/null 2>&1 || { printf "Docker is not running in this Codespace.\n" >&2; exit 1; }
[[ -d "$ROOT/backend/node_modules/@supabase/supabase-js" ]] || npm ci --prefix "$ROOT/backend"

prompt_db_url SOURCE_DB_URL "Source ROSS Supabase Session-pooler URI"
prompt_db_url TARGET_DB_URL "Temporary restore-project Session-pooler URI"
prompt_value SOURCE_S3_ENDPOINT "Source Storage S3 endpoint URL"
prompt_value SOURCE_S3_REGION "Source Storage S3 region" "ca-central-1"
prompt_secret SOURCE_S3_ACCESS_KEY_ID "Source Storage S3 access-key ID"
prompt_secret SOURCE_S3_SECRET_ACCESS_KEY "Source Storage S3 secret access key"
prompt_value TARGET_S3_ENDPOINT "Temporary project Storage S3 endpoint URL"
prompt_value TARGET_S3_REGION "Temporary project Storage S3 region" "ca-central-1"
prompt_secret TARGET_S3_ACCESS_KEY_ID "Temporary project Storage S3 access-key ID"
prompt_secret TARGET_S3_SECRET_ACCESS_KEY "Temporary project Storage S3 secret access key"
prompt_value TARGET_SUPABASE_URL "Temporary project URL (https://PROJECT.supabase.co)"
prompt_secret TARGET_SUPABASE_SERVICE_ROLE_KEY "Temporary project service-role/secret key"

export RESTORE_BUCKET="ross-private-files"
export RESTORE_SEED_KEY="$SEED_KEY"
export RESTORE_SEED_CONTENT="$SEED_CONTENT"
export RESTORE_STORAGE_REPORT="$WORKDIR/storage.json"
export RESTORE_AUTH_REPORT="$WORKDIR/auth.json"
export MARKER="$TOKEN"

printf "\n[1/8] Seeding synthetic source evidence...\n"
printf "insert into public.security_audit_events (event_type, resource_type, resource_id, metadata) values ('restore.exercise.seed', 'backup_restore', :'marker', jsonb_build_object('synthetic', true, 'sha256', :'seed_hash'));\n" |
  docker run --rm -i -e DATABASE_URL="$SOURCE_DB_URL" -e MARKER="$TOKEN" -e SEED_HASH="$(printf '%s' "$SEED_CONTENT" | sha256sum | awk '{print $1}')" postgres:17-alpine \
    sh -c 'psql --variable ON_ERROR_STOP=1 --variable marker="$MARKER" --variable seed_hash="$SEED_HASH" --dbname "$DATABASE_URL"'
SOURCE_SEEDED=1
node "$ROOT/backend/scripts/restore-storage-exercise.mjs" seed >/dev/null

cat >"$WORKDIR/fingerprint.sql" <<'SQL'
create or replace function pg_temp.ross_fingerprints()
returns table(table_name text, row_count bigint, content_sha256 text)
language plpgsql as $$
declare item record;
begin
  for item in
    select schemaname, tablename from pg_tables
    where schemaname = 'public' order by tablename
  loop
    return query execute format(
      'select %L, count(*), encode(digest(coalesce(string_agg(to_jsonb(t)::text, E''\\n'' order by to_jsonb(t)::text), ''''), ''sha256''), ''hex'') from %I.%I t',
      item.tablename, item.schemaname, item.tablename
    );
  end loop;
end $$;
select table_name, row_count, content_sha256 from pg_temp.ross_fingerprints() order by table_name;
SQL

printf "[2/8] Fingerprinting source database...\n"
docker run --rm -e DATABASE_URL="$SOURCE_DB_URL" -v "$WORKDIR:/work:ro" postgres:17-alpine \
  sh -c 'psql --quiet --tuples-only --no-align --field-separator "|" --variable ON_ERROR_STOP=1 --file /work/fingerprint.sql --dbname "$DATABASE_URL"' \
  >"$WORKDIR/source-fingerprints.txt"

printf "[3/8] Creating encrypted-in-transit logical backup...\n"
(
  cd "$WORKDIR"
  npx --yes supabase@latest db dump --db-url "$SOURCE_DB_URL" -f roles.sql --role-only
  npx --yes supabase@latest db dump --db-url "$SOURCE_DB_URL" -f schema.sql
  npx --yes supabase@latest db dump --db-url "$SOURCE_DB_URL" -f data.sql --use-copy --data-only \
    -x "storage.buckets_vectors" -x "storage.vector_indexes"
)

printf "[4/8] Restoring database into the isolated project...\n"
docker run --rm -e DATABASE_URL="$TARGET_DB_URL" -v "$WORKDIR:/work:ro" postgres:17-alpine \
  sh -c 'psql --single-transaction --variable ON_ERROR_STOP=1 --file /work/roles.sql --file /work/schema.sql --command "SET session_replication_role = replica" --file /work/data.sql --dbname "$DATABASE_URL"'

printf "[5/8] Comparing restored database fingerprints...\n"
docker run --rm -e DATABASE_URL="$TARGET_DB_URL" -v "$WORKDIR:/work:ro" postgres:17-alpine \
  sh -c 'psql --quiet --tuples-only --no-align --field-separator "|" --variable ON_ERROR_STOP=1 --file /work/fingerprint.sql --dbname "$DATABASE_URL"' \
  >"$WORKDIR/target-fingerprints.txt"
cmp --silent "$WORKDIR/source-fingerprints.txt" "$WORKDIR/target-fingerprints.txt" || {
  printf "Restored public-table fingerprints differ from the source.\n" >&2
  exit 1
}

cat >"$WORKDIR/boundaries.sql" <<'SQL'
select json_build_object(
  'userProfilesWithoutAuth', (select count(*) from public.user_profiles p left join auth.users u on u.id = p.user_id where u.id is null),
  'documentsWithMismatchedProjectOwner', (select count(*) from public.documents d join public.projects p on p.id = d.project_id where d.user_id <> p.user_id),
  'foldersWithMismatchedProjectOwner', (select count(*) from public.project_subfolders f join public.projects p on p.id = f.project_id where f.user_id <> p.user_id),
  'orphanDocumentVersions', (select count(*) from public.document_versions v left join public.documents d on d.id = v.document_id where d.id is null)
)::text;
SQL
docker run --rm -e DATABASE_URL="$TARGET_DB_URL" -v "$WORKDIR:/work:ro" postgres:17-alpine \
  sh -c 'psql --quiet --tuples-only --no-align --variable ON_ERROR_STOP=1 --file /work/boundaries.sql --dbname "$DATABASE_URL"' \
  >"$WORKDIR/boundaries.json"
node -e 'const f=require("fs"); const x=JSON.parse(f.readFileSync(process.argv[1],"utf8")); if(Object.values(x).some(Number)) process.exit(1)' "$WORKDIR/boundaries.json"

printf "[6/8] Copying and hash-verifying Supabase Storage...\n"
node "$ROOT/backend/scripts/restore-storage-exercise.mjs" copy-and-verify >/dev/null

printf "[7/8] Exercising isolated authentication recovery...\n"
node "$ROOT/backend/scripts/restore-storage-exercise.mjs" auth-recovery >/dev/null

printf "[8/8] Writing sanitized evidence...\n"
COMPLETED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export STAMP COMPLETED TOKEN WORKDIR REPORT
node <<'NODE'
const fs = require("fs");
const crypto = require("crypto");
const bytes = (name) => fs.readFileSync(`${process.env.WORKDIR}/${name}`);
const read = (name) => bytes(name).toString("utf8").trim();
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const source = read("source-fingerprints.txt");
const rows = source.split("\n").filter(Boolean).map((line) => Number(line.split("|")[1]));
const files = ["roles.sql", "schema.sql", "data.sql"];
const report = {
  version: "1.0.0",
  exercise: "isolated-backup-restore",
  exerciseId: process.env.TOKEN,
  startedAtUtc: process.env.STAMP,
  completedAtUtc: process.env.COMPLETED,
  provider: "Supabase Free; Canada Central",
  sourceDataBoundary: "synthetic or affirmatively non-confidential controlled-beta data",
  database: {
    backupFiles: files.map((name) => ({ name, sha256: hash(bytes(name)) })),
    publicTableCount: rows.length,
    publicRowCount: rows.reduce((a, b) => a + b, 0),
    sourceFingerprintSha256: hash(source),
    targetFingerprintSha256: hash(read("target-fingerprints.txt")),
    allPublicTableFingerprintsMatched: source === read("target-fingerprints.txt"),
  },
  tenantBoundaryChecks: JSON.parse(read("boundaries.json")),
  storage: JSON.parse(read("storage.json")),
  authenticationRecovery: JSON.parse(read("auth.json")),
  recoveryPointObservation: process.env.STAMP,
  recoveryCompletedObservation: process.env.COMPLETED,
  secretsWrittenToReport: false,
  targetEnvironmentDestroyed: false,
  decision: "passed-pending-target-destruction",
};
fs.writeFileSync(process.env.REPORT, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
NODE

printf "\nPASS: isolated database, storage, tenant-boundary, and auth-recovery checks succeeded.\n"
printf "Sanitized report: %s\n" "$REPORT"
printf "Next: send the report contents for review, then delete the temporary Supabase project.\n"
