import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const bucket = process.env.RESTORE_BUCKET?.trim() || "ross-private-files";
const seedKey = required("RESTORE_SEED_KEY");
const seedContent = required("RESTORE_SEED_CONTENT");
const seedHash = sha256(seedContent);

function client(prefix) {
  return new S3Client({
    region: required(`${prefix}_S3_REGION`),
    endpoint: required(`${prefix}_S3_ENDPOINT`),
    forcePathStyle: true,
    credentials: {
      accessKeyId: required(`${prefix}_S3_ACCESS_KEY_ID`),
      secretAccessKey: required(`${prefix}_S3_SECRET_ACCESS_KEY`),
    },
  });
}

async function bodyBytes(body) {
  if (!body) throw new Error("Storage returned an empty object body");
  return Buffer.from(await body.transformToByteArray());
}

async function ensureBucket(target) {
  try {
    await target.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!/exist|owned|conflict|409/i.test(message)) throw error;
  }
}

async function listAll(storage) {
  const objects = [];
  let ContinuationToken;
  do {
    const page = await storage.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken }),
    );
    for (const item of page.Contents ?? []) {
      if (item.Key) objects.push(item.Key);
    }
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
  return objects.sort();
}

async function seed() {
  const source = client("SOURCE");
  await source.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: seedKey,
      Body: Buffer.from(seedContent, "utf8"),
      ContentType: "text/plain; charset=utf-8",
    }),
  );
  const restored = await source.send(
    new GetObjectCommand({ Bucket: bucket, Key: seedKey }),
  );
  const observedHash = sha256(await bodyBytes(restored.Body));
  if (observedHash !== seedHash) throw new Error("Source storage seed hash mismatch");
  process.stdout.write(`${JSON.stringify({ seedHash, seeded: true })}\n`);
}

async function cleanupSource() {
  const source = client("SOURCE");
  await source.send(new DeleteObjectCommand({ Bucket: bucket, Key: seedKey }));
  process.stdout.write(`${JSON.stringify({ sourceSeedRemoved: true })}\n`);
}

async function copyAndVerify() {
  const source = client("SOURCE");
  const target = client("TARGET");
  await ensureBucket(target);

  const sourceKeys = await listAll(source);
  if (!sourceKeys.includes(seedKey)) throw new Error("Storage seed is missing from source");

  const manifest = [];
  let totalBytes = 0;
  let seedVerified = false;
  for (const key of sourceKeys) {
    const sourceObject = await source.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const bytes = await bodyBytes(sourceObject.Body);
    const sourceHash = sha256(bytes);
    totalBytes += bytes.length;

    await target.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: sourceObject.ContentType,
        CacheControl: sourceObject.CacheControl,
        Metadata: sourceObject.Metadata,
      }),
    );
    const targetObject = await target.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const targetHash = sha256(await bodyBytes(targetObject.Body));
    if (targetHash !== sourceHash) throw new Error("Restored storage hash mismatch");
    if (key === seedKey) seedVerified = targetHash === seedHash;
    manifest.push(`${sha256(key)}:${sourceHash}`);
  }

  const targetKeys = await listAll(target);
  if (targetKeys.length !== sourceKeys.length) {
    throw new Error("Target storage object count differs from source");
  }
  if (targetKeys.some((key, index) => key !== sourceKeys[index])) {
    throw new Error("Target storage object set differs from source");
  }
  if (!seedVerified) throw new Error("Restored storage seed did not verify");

  const result = {
    provider: "Supabase Storage S3",
    bucket,
    objectCount: sourceKeys.length,
    totalBytes,
    manifestSha256: sha256(`${manifest.sort().join("\n")}\n`),
    seedSha256: seedHash,
    seedVerified,
    allObjectHashesMatched: true,
  };
  await writeFile(required("RESTORE_STORAGE_REPORT"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function authRecovery() {
  const target = createClient(
    required("TARGET_SUPABASE_URL"),
    required("TARGET_SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const email = `ross-restore-${randomBytes(8).toString("hex")}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  let userId;
  try {
    const created = await target.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { restore_exercise: true },
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("Target auth user was not created");
    }
    userId = created.data.user.id;
    const recovery = await target.auth.admin.generateLink({ type: "recovery", email });
    if (recovery.error || !recovery.data.properties?.action_link) {
      throw recovery.error ?? new Error("Target recovery link was not generated");
    }
    const result = {
      targetSyntheticUserCreated: true,
      recoveryLinkGenerated: true,
      productionPasswordOrSessionCopied: false,
      emailSent: false,
    };
    await writeFile(required("RESTORE_AUTH_REPORT"), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    if (userId) await target.auth.admin.deleteUser(userId);
  }
}

const action = process.argv[2];
if (action === "seed") await seed();
else if (action === "copy-and-verify") await copyAndVerify();
else if (action === "cleanup-source") await cleanupSource();
else if (action === "auth-recovery") await authRecovery();
else throw new Error("Expected action: seed, copy-and-verify, cleanup-source, or auth-recovery");
