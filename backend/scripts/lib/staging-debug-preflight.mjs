import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

export const REQUIRED_SCHEMA_CHECKS = [
  ["user_profiles", "id,terms_accepted_at,privacy_acknowledged_at"],
  ["projects", "id,user_id"],
  ["documents", "id,project_id"],
  ["document_versions", "id,scan_status"],
  ["document_scan_jobs", "id,status"],
  ["user_api_keys", "id,provider"],
  ["security_audit_events", "id,event_type"],
];

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Staging resource configuration is missing ${name}.`);
  return value;
}

export function supabaseKeyHeaders(key, label, { opaquePrefix, legacyRole } = {}) {
  if (key.startsWith(opaquePrefix ?? "sb_")) return { apikey: key };
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    let role;
    try {
      role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")).role;
    } catch {
      throw new Error(`${label} legacy JWT payload is invalid.`);
    }
    if (legacyRole && role !== legacyRole) {
      throw new Error(`${label} legacy JWT must have role ${legacyRole}.`);
    }
    return { apikey: key, Authorization: `Bearer ${key}` };
  }
  throw new Error(`${label} must be an opaque sb_publishable_/sb_secret_ key or a legacy JWT key.`);
}

export async function runStagingDebugPreflight({
  environment = process.env,
  fetchImpl = fetch,
  createS3Client = (options) => new S3Client(options),
} = {}) {
  const supabase = required(environment, "ROSS_STAGING_SUPABASE_URL").replace(/\/+$/, "");
  const publishable = required(environment, "ROSS_STAGING_SUPABASE_PUBLISHABLE_KEY");
  const secret = required(environment, "ROSS_STAGING_SUPABASE_SECRET_KEY");

  const request = async (label, path, key, keyOptions, method = "GET") => {
    const response = await fetchImpl(`${supabase}${path}`, {
      method,
      headers: supabaseKeyHeaders(key, label, keyOptions),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  };

  const publishableOptions = { opaquePrefix: "sb_publishable_", legacyRole: "anon" };
  const secretOptions = { opaquePrefix: "sb_secret_", legacyRole: "service_role" };
  await request("Supabase publishable key validation", "/auth/v1/settings", publishable, publishableOptions);
  await request("Supabase secret key validation", "/auth/v1/settings", secret, secretOptions);
  for (const [table, columns] of REQUIRED_SCHEMA_CHECKS) {
    await request(`Required table/migration check ${table}`, `/rest/v1/${table}?select=${columns}&limit=0`, secret, secretOptions, "HEAD");
  }

  const s3 = createS3Client({
    endpoint: required(environment, "ROSS_STAGING_S3_ENDPOINT_URL"),
    region: required(environment, "ROSS_STAGING_S3_REGION"),
    credentials: {
      accessKeyId: required(environment, "ROSS_STAGING_S3_ACCESS_KEY_ID"),
      secretAccessKey: required(environment, "ROSS_STAGING_S3_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: true,
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: "ross-staging-debug" }));
  } catch (error) {
    throw new Error(`Read-only staging bucket validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { schemaChecks: REQUIRED_SCHEMA_CHECKS.length, bucket: "ross-staging-debug" };
}
