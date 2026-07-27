#!/usr/bin/env node
import { createHash, createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

const required = (environment, name) => {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Required staging preflight value is missing: ${name}`);
  return value;
};

function jwtRole(key, label) {
  const pieces = key.split(".");
  if (pieces.length !== 3) throw new Error(`${label} must be an opaque Supabase key or a valid JWT.`);
  let payload;
  try { payload = JSON.parse(Buffer.from(pieces[1], "base64url").toString("utf8")); }
  catch { throw new Error(`${label} JWT payload is invalid.`); }
  if (typeof payload.role !== "string") throw new Error(`${label} JWT must contain an explicit role.`);
  return payload.role;
}

export function validateSupabaseKeys(publishableKey, secretKey) {
  const publishableOpaque = publishableKey.startsWith("sb_publishable_");
  const secretOpaque = secretKey.startsWith("sb_secret_");
  if (publishableOpaque || secretOpaque) {
    if (!publishableOpaque) throw new Error("Publishable key must use the sb_publishable_ prefix when opaque keys are configured.");
    if (!secretOpaque) throw new Error("Secret key must use the sb_secret_ prefix when opaque keys are configured.");
    return { kind: "opaque" };
  }
  if (jwtRole(publishableKey, "Publishable key") !== "anon") throw new Error("Legacy publishable JWT must have role anon.");
  if (jwtRole(secretKey, "Secret key") !== "service_role") throw new Error("Legacy secret JWT must have role service_role.");
  return { kind: "legacy-jwt" };
}

async function expectOk(response, label) {
  if (response.ok) return;
  const detail = (await response.text()).trim().slice(0, 300);
  throw new Error(`${label} failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
}

export async function preflightSupabase({ url, publishableKey, secretKey, fetchImpl = fetch }) {
  validateSupabaseKeys(publishableKey, secretKey);
  const origin = url.replace(/\/+$/, "");
  await expectOk(await fetchImpl(`${origin}/auth/v1/settings`, {
    method: "GET", headers: { apikey: publishableKey }, signal: AbortSignal.timeout(15_000),
  }), "Supabase publishable-key preflight");
  await expectOk(await fetchImpl(`${origin}/rest/v1/user_profiles?select=id&limit=0`, {
    method: "GET",
    headers: { apikey: secretKey, "Accept-Profile": "public" },
    signal: AbortSignal.timeout(15_000),
  }), "Supabase public.user_profiles.id schema preflight");
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value, encoding) => createHmac("sha256", key).update(value).digest(encoding);

export async function preflightS3({ endpoint, region, accessKeyId, secretAccessKey, bucket, fetchImpl = fetch, now = new Date() }) {
  const base = new URL(endpoint.replace(/\/+$/, "") + "/");
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/${encodeURIComponent(bucket)}`;
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = timestamp.slice(0, 8);
  const service = "s3";
  const scope = `${day}/${region}/${service}/aws4_request`;
  const payloadHash = sha256("");
  const canonicalHeaders = `host:${base.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = `HEAD\n${base.pathname}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const stringToSign = `AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${sha256(canonical)}`;
  const dateKey = hmac(`AWS4${secretAccessKey}`, day);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = hmac(signingKey, stringToSign, "hex");
  const response = await fetchImpl(base, { method: "HEAD", headers: {
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": payloadHash, "x-amz-date": timestamp,
  }, signal: AbortSignal.timeout(15_000) });
  await expectOk(response, `S3 bucket ${bucket} read-only preflight`);
}

export async function runStagingPreflight(environment = process.env, options = {}) {
  await preflightSupabase({
    url: required(environment, "ROSS_STAGING_SUPABASE_URL"),
    publishableKey: required(environment, "ROSS_STAGING_SUPABASE_PUBLISHABLE_KEY"),
    secretKey: required(environment, "ROSS_STAGING_SUPABASE_SECRET_KEY"),
    fetchImpl: options.fetchImpl,
  });
  await preflightS3({
    endpoint: required(environment, "ROSS_STAGING_S3_ENDPOINT_URL"),
    region: required(environment, "ROSS_STAGING_S3_REGION"),
    accessKeyId: required(environment, "ROSS_STAGING_S3_ACCESS_KEY_ID"),
    secretAccessKey: required(environment, "ROSS_STAGING_S3_SECRET_ACCESS_KEY"),
    bucket: required(environment, "ROSS_STAGING_S3_BUCKET"),
    fetchImpl: options.fetchImpl,
  });
  console.log("Read-only staging Supabase and S3 preflights passed.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) runStagingPreflight().catch((error) => { console.error(error.message); process.exit(1); });
