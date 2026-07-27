#!/usr/bin/env node
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Staging resource configuration is missing ${name}.`);
  return value;
};
const supabase = required("ROSS_STAGING_SUPABASE_URL").replace(/\/+$/, "");
const publishable = required("ROSS_STAGING_SUPABASE_PUBLISHABLE_KEY");
const secret = required("ROSS_STAGING_SUPABASE_SECRET_KEY");

async function request(label, path, key, method = "GET") {
  const response = await fetch(`${supabase}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
}

await request("Supabase publishable key validation", "/auth/v1/settings", publishable);
await request("Supabase secret key validation", "/auth/v1/settings", secret);
for (const [table, columns] of [
  ["user_profiles", "id,terms_accepted_at,privacy_acknowledged_at"],
  ["projects", "id,user_id"],
  ["documents", "id,project_id"],
  ["document_versions", "id,scan_status"],
  ["document_scan_jobs", "id,status"],
  ["user_api_keys", "id,provider"],
  ["security_audit_events", "id,event_type"],
]) {
  await request(`Required table/migration check ${table}`, `/rest/v1/${table}?select=${columns}&limit=0`, secret, "HEAD");
}

const s3 = new S3Client({
  endpoint: required("ROSS_STAGING_S3_ENDPOINT_URL"),
  region: required("ROSS_STAGING_S3_REGION"),
  credentials: {
    accessKeyId: required("ROSS_STAGING_S3_ACCESS_KEY_ID"),
    secretAccessKey: required("ROSS_STAGING_S3_SECRET_ACCESS_KEY"),
  },
  forcePathStyle: true,
});
try {
  await s3.send(new HeadBucketCommand({ Bucket: "ross-staging-debug" }));
} catch (error) {
  throw new Error(`Read-only staging bucket validation failed: ${error instanceof Error ? error.message : String(error)}`);
}
console.log("PASS: staging Supabase keys, schema, migrations, and storage bucket are readable.");
