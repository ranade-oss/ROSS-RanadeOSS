import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "./supabase";
import {
  deleteFile,
  getSignedUploadUrl,
  getSignedUrl,
} from "./storage";
import { recordSecurityAuditEvent } from "./securityAudit";
import type { DocumentScanJob, FileWorkerResult } from "./documentScanTypes";

const MAX_SCAN_ATTEMPTS = 3;
const DEFAULT_POLL_INTERVAL_MS = 15_000;
const WORKER_TIMEOUT_MS = 10 * 60 * 1_000;

let dispatcherStarted = false;
let dispatcherBusy = false;

export function startDocumentScanDispatcher() {
  if (dispatcherStarted || process.env.NODE_ENV === "test") return;
  const workerUrl = process.env.FILE_WORKER_URL?.trim();
  const workerSecret = process.env.FILE_WORKER_SHARED_SECRET?.trim();
  if (!workerUrl || !workerSecret) {
    if (process.env.ROSS_HOSTED_MODE !== "self-hosted") {
      console.error(
        "[document-scan] FILE_WORKER_URL and FILE_WORKER_SHARED_SECRET are required for hosted uploads.",
      );
    }
    return;
  }

  dispatcherStarted = true;
  const configuredInterval = Number.parseInt(
    process.env.FILE_WORKER_POLL_INTERVAL_MS ?? "",
    10,
  );
  const interval =
    Number.isFinite(configuredInterval) && configuredInterval >= 5_000
      ? configuredInterval
      : DEFAULT_POLL_INTERVAL_MS;

  const poll = () => void dispatchAvailableJobs().catch((error) => {
    console.error("[document-scan] dispatcher poll failed", safeError(error));
  });
  poll();
  setInterval(poll, interval).unref();
}

export async function dispatchAvailableJobs() {
  if (dispatcherBusy) return;
  dispatcherBusy = true;
  try {
    const db = createServerSupabase();
    for (let count = 0; count < 3; count += 1) {
      const job = await claimDocumentScanJob(db);
      if (!job) break;
      await processDocumentScanJob(db, job);
    }
  } finally {
    dispatcherBusy = false;
  }
}

export async function claimDocumentScanJob(
  db: SupabaseClient,
): Promise<DocumentScanJob | null> {
  const { data, error } = await db.rpc("claim_document_scan_job");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as DocumentScanJob | null) ?? null;
}

export async function processDocumentScanJob(
  db: SupabaseClient,
  job: DocumentScanJob,
) {
  const workerUrl = requiredEnv("FILE_WORKER_URL");
  const workerSecret = requiredEnv("FILE_WORKER_SHARED_SECRET");
  const downloadUrl = await getSignedUrl(job.quarantine_storage_path, 900);
  const cleanUploadUrl = await getSignedUploadUrl(
    job.clean_storage_path,
    job.content_type,
    900,
  );
  const derivedUploadUrl = job.derived_storage_path
    ? await getSignedUploadUrl(job.derived_storage_path, "application/pdf", 900)
    : null;
  if (!downloadUrl || !cleanUploadUrl || (job.derived_storage_path && !derivedUploadUrl)) {
    await retryOrFail(db, job, "signed_url_creation_failed");
    return;
  }

  await db
    .from("document_versions")
    .update({ scan_started_at: new Date().toISOString() })
    .eq("id", job.version_id);

  let result: FileWorkerResult;
  try {
    const response = await fetch(new URL("/process", workerUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jobId: job.id,
        filename: job.filename,
        fileType: job.file_type,
        contentType: job.content_type,
        quarantineDownloadUrl: downloadUrl,
        cleanUploadUrl,
        derivedUploadUrl,
      }),
      signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
    });
    if (!response.ok) {
      await retryOrFail(db, job, `worker_http_${response.status}`);
      return;
    }
    result = validateWorkerResult(await response.json());
  } catch (error) {
    console.error("[document-scan] worker request failed", safeError(error));
    await retryOrFail(db, job, "worker_request_failed");
    return;
  }

  if (result.status === "clean") {
    await finalizeCleanJob(db, job, result);
    return;
  }
  if (result.status === "infected") {
    await finalizeRejectedJob(db, job, result, "infected");
    return;
  }
  await retryOrFail(db, job, result.failureCode ?? "worker_scan_failed", result);
}

async function finalizeCleanJob(
  db: SupabaseClient,
  job: DocumentScanJob,
  result: FileWorkerResult,
) {
  const pdfStoragePath =
    job.file_type === "pdf"
      ? job.clean_storage_path
      : result.derivedCreated
        ? job.derived_storage_path
        : null;
  const completedAt = new Date().toISOString();
  const { error } = await db
    .from("document_versions")
    .update({
      storage_path: job.clean_storage_path,
      pdf_storage_path: pdfStoragePath,
      quarantine_storage_path: null,
      filename: job.filename,
      file_type: job.file_type,
      size_bytes: job.size_bytes,
      page_count: result.pageCount,
      scan_status: "clean",
      scan_engine: result.engine,
      scan_signature_version: result.signatureVersion,
      scan_result: result.result,
      scan_sha256: result.sha256,
      scan_completed_at: completedAt,
      scan_failure_code: null,
    })
    .eq("id", job.version_id)
    .eq("document_id", job.document_id);
  if (error) {
    await retryOrFail(db, job, "version_clean_update_failed", result);
    return;
  }

  const [jobUpdate, documentUpdate] = await Promise.all([
    db.from("document_scan_jobs").update({
      status: "clean",
      completed_at: completedAt,
      locked_at: null,
      last_error_code: null,
      scan_engine: result.engine,
      scan_signature_version: result.signatureVersion,
      scan_result: result.result,
      scan_sha256: result.sha256,
      updated_at: completedAt,
    }).eq("id", job.id),
    db.from("documents").update({
      current_version_id: job.version_id,
      status: "ready",
      updated_at: completedAt,
    }).eq("id", job.document_id),
  ]);
  if (jobUpdate.error || documentUpdate.error) {
    console.error("[document-scan] clean finalization did not commit", {
      jobId: job.id,
      jobUpdate: jobUpdate.error?.message ?? null,
      documentUpdate: documentUpdate.error?.message ?? null,
    });
    await retryOrFail(db, job, "clean_finalization_failed", result);
    return;
  }

  const oldPaths = new Set(
    [
      job.quarantine_storage_path,
      job.previous_storage_path,
      job.previous_pdf_storage_path,
    ].filter((path): path is string => Boolean(path)),
  );
  await Promise.all([...oldPaths].map((path) => deleteFile(path).catch(() => {})));
}

async function retryOrFail(
  db: SupabaseClient,
  job: DocumentScanJob,
  failureCode: string,
  result?: FileWorkerResult,
) {
  if (job.attempts < MAX_SCAN_ATTEMPTS) {
    const retryAt = new Date(Date.now() + 60_000).toISOString();
    await db.from("document_scan_jobs").update({
      status: "queued",
      available_at: retryAt,
      locked_at: null,
      last_error_code: failureCode,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return;
  }
  await finalizeRejectedJob(
    db,
    job,
    result ?? failedWorkerResult(failureCode),
    "failed",
  );
}

async function finalizeRejectedJob(
  db: SupabaseClient,
  job: DocumentScanJob,
  result: FileWorkerResult,
  status: "infected" | "failed",
) {
  const completedAt = new Date().toISOString();
  const isReplacement =
    Boolean(job.previous_storage_path) && job.previous_scan_status === "clean";

  if (isReplacement) {
    await db
      .from("document_versions")
      .update({
        quarantine_storage_path: null,
        scan_status: "clean",
        scan_started_at: null,
      })
      .eq("id", job.version_id);
  } else {
    await db
      .from("document_versions")
      .update({
        storage_path: null,
        pdf_storage_path: null,
        scan_status: status,
        scan_engine: result.engine,
        scan_signature_version: result.signatureVersion,
        scan_result: result.result,
        scan_sha256: result.sha256 || null,
        scan_completed_at: completedAt,
        scan_failure_code: result.failureCode,
      })
      .eq("id", job.version_id);
  }

  await db.from("document_scan_jobs").update({
    status,
    completed_at: completedAt,
    locked_at: null,
    last_error_code: result.failureCode,
    scan_engine: result.engine,
    scan_signature_version: result.signatureVersion,
    scan_result: result.result,
    scan_sha256: result.sha256 || null,
    updated_at: completedAt,
  }).eq("id", job.id);

  const previousCurrent = job.previous_current_version_id;
  await db.from("documents").update({
    current_version_id:
      previousCurrent && previousCurrent !== job.version_id
        ? previousCurrent
        : job.version_id,
    status: isReplacement || (previousCurrent && previousCurrent !== job.version_id)
      ? "ready"
      : "error",
    updated_at: completedAt,
  }).eq("id", job.document_id);

  await Promise.all(
    [job.clean_storage_path, job.derived_storage_path]
      .filter((path): path is string => Boolean(path))
      .map((path) => deleteFile(path).catch(() => {})),
  );

  await recordSecurityAuditEvent({
    db,
    actorUserId: job.user_id,
    eventType: `document.scan.${status}`,
    resourceType: "document_version",
    resourceId: job.version_id,
    metadata: {
      provider: result.engine,
      result: result.result,
      failureCode: result.failureCode,
      sha256: result.sha256 || null,
      scope: "uploaded-file",
      count: 1,
    },
  }).catch((error) => {
    console.error("[document-scan] audit event failed", safeError(error));
  });
  await sendOperatorAlert(job, status, result.failureCode);
}

async function sendOperatorAlert(
  job: DocumentScanJob,
  status: "infected" | "failed",
  failureCode: string | null,
) {
  const url = process.env.SECURITY_ALERT_WEBHOOK_URL?.trim();
  const secret = process.env.SECURITY_ALERT_WEBHOOK_SECRET?.trim();
  if (!url || !secret) {
    console.error("[document-scan] operator alert is not configured", {
      jobId: job.id,
      versionId: job.version_id,
      status,
    });
    return;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "ross.document_scan_alert",
        jobId: job.id,
        versionId: job.version_id,
        status,
        failureCode,
        occurredAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`alert webhook returned ${response.status}`);
  } catch (error) {
    console.error("[document-scan] operator alert delivery failed", safeError(error));
  }
}

export function validateWorkerResult(value: unknown): FileWorkerResult {
  if (!value || typeof value !== "object") throw new Error("Invalid worker result.");
  const candidate = value as Partial<FileWorkerResult>;
  if (
    (candidate.status !== "clean" &&
      candidate.status !== "infected" &&
      candidate.status !== "failed") ||
    candidate.engine !== "clamav" ||
    typeof candidate.result !== "string" ||
    typeof candidate.sha256 !== "string" ||
    typeof candidate.derivedCreated !== "boolean" ||
    (candidate.status !== "failed" && !/^[a-f0-9]{64}$/.test(candidate.sha256)) ||
    (candidate.status === "infected" && candidate.derivedCreated) ||
    (candidate.status === "failed" && typeof candidate.failureCode !== "string")
  ) {
    throw new Error("Invalid worker result.");
  }
  return {
    status: candidate.status,
    engine: "clamav",
    result: candidate.result.slice(0, 120),
    sha256: candidate.sha256,
    signatureVersion:
      typeof candidate.signatureVersion === "string"
        ? candidate.signatureVersion.slice(0, 120)
        : null,
    pageCount:
      typeof candidate.pageCount === "number" &&
      Number.isSafeInteger(candidate.pageCount) &&
      candidate.pageCount >= 0
        ? candidate.pageCount
        : null,
    derivedCreated: candidate.derivedCreated,
    failureCode:
      typeof candidate.failureCode === "string"
        ? candidate.failureCode.slice(0, 120)
        : null,
  };
}

function failedWorkerResult(failureCode: string): FileWorkerResult {
  return {
    status: "failed",
    engine: "clamav",
    result: "scan_failed",
    sha256: "",
    signatureVersion: null,
    pageCount: null,
    derivedCreated: false,
    failureCode,
  };
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 200) : "unknown error";
}
