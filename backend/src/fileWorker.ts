import "dotenv/config";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import express from "express";
import { docxToPdf } from "./lib/convert";
import { shouldConvertToPdf } from "./lib/documentTypes";
import { MAX_UPLOAD_SIZE_BYTES } from "./lib/upload";
import { validateScannedDocument } from "./lib/uploadValidation";
import type { FileWorkerResult } from "./lib/documentScanTypes";

const execFileAsync = promisify(execFile);
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

type ProcessRequest = {
  jobId: string;
  filename: string;
  fileType: string;
  contentType: string;
  quarantineDownloadUrl: string;
  cleanUploadUrl: string;
  derivedUploadUrl: string | null;
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ross-file-worker" });
});

app.post("/process", requireWorkerAuthorization, async (req, res) => {
  let input: ProcessRequest;
  try {
    input = validateProcessRequest(req.body);
  } catch (error) {
    return void res.status(400).json({ detail: safeError(error) });
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "ross-scan-"));
  const sourcePath = path.join(workDir, `source.${safeExtension(input.fileType)}`);
  try {
    const bytes = await downloadBounded(input.quarantineDownloadUrl);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    await writeFile(sourcePath, bytes, { mode: 0o600 });

    const scan = await scanWithClamAv(sourcePath);
    if (scan.status === "infected") {
      const result: FileWorkerResult = {
        status: "infected",
        engine: "clamav",
        result: scan.result,
        sha256,
        signatureVersion: scan.signatureVersion,
        pageCount: null,
        derivedCreated: false,
        failureCode: null,
      };
      return void res.json(result);
    }
    if (scan.status === "failed") {
      const result: FileWorkerResult = {
        status: "failed",
        engine: "clamav",
        result: scan.result,
        sha256,
        signatureVersion: scan.signatureVersion,
        pageCount: null,
        derivedCreated: false,
        failureCode: scan.failureCode,
      };
      return void res.json(result);
    }

    await validateScannedDocument({
      buffer: bytes,
      originalname: `source.${input.fileType}`,
    });

    await uploadSigned(input.cleanUploadUrl, bytes, input.contentType);

    let derivedCreated = false;
    let pageCount: number | null = null;
    if (input.fileType === "pdf") {
      pageCount = await countPdfPages(bytes);
    } else if (shouldConvertToPdf(input.fileType)) {
      if (!input.derivedUploadUrl) {
        throw new WorkerFailure("derived_upload_url_missing");
      }
      const pdf = await docxToPdf(bytes);
      await uploadSigned(input.derivedUploadUrl, pdf, "application/pdf");
      derivedCreated = true;
      pageCount = await countPdfPages(pdf);
    }

    const result: FileWorkerResult = {
      status: "clean",
      engine: "clamav",
      result: "no_threats_found",
      sha256,
      signatureVersion: scan.signatureVersion,
      pageCount,
      derivedCreated,
      failureCode: null,
    };
    return void res.json(result);
  } catch (error) {
    const failureCode =
      error instanceof WorkerFailure ? error.code : "worker_processing_failed";
    console.error("[file-worker] processing failed", {
      jobId: input.jobId,
      failureCode,
    });
    const result: FileWorkerResult = {
      status: "failed",
      engine: "clamav",
      result: "processing_failed",
      sha256: "",
      signatureVersion: null,
      pageCount: null,
      derivedCreated: false,
      failureCode,
    };
    return void res.json(result);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
});

const port = positiveInteger(process.env.PORT, 3002);
app.listen(port, "0.0.0.0", () => {
  console.log(`ROSS private file worker listening on ${port}`);
});

function requireWorkerAuthorization(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const secret = process.env.FILE_WORKER_SHARED_SECRET?.trim();
  const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !safeEqual(secret, supplied)) {
    return void res.status(404).json({ detail: "Not found" });
  }
  next();
}

function validateProcessRequest(value: unknown): ProcessRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid request.");
  const input = value as Partial<ProcessRequest>;
  for (const key of [
    "jobId",
    "filename",
    "fileType",
    "contentType",
    "quarantineDownloadUrl",
    "cleanUploadUrl",
  ] as const) {
    if (typeof input[key] !== "string" || !input[key]?.trim()) {
      throw new Error(`Invalid ${key}.`);
    }
  }
  if (
    input.derivedUploadUrl !== null &&
    input.derivedUploadUrl !== undefined &&
    typeof input.derivedUploadUrl !== "string"
  ) {
    throw new Error("Invalid derivedUploadUrl.");
  }
  assertAllowedStorageUrl(input.quarantineDownloadUrl!);
  assertAllowedStorageUrl(input.cleanUploadUrl!);
  if (input.derivedUploadUrl) assertAllowedStorageUrl(input.derivedUploadUrl);
  if (!/^[a-z0-9]{1,16}$/.test(input.fileType!)) {
    throw new Error("Invalid fileType.");
  }
  return {
    jobId: input.jobId!.slice(0, 80),
    filename: input.filename!.slice(0, 200),
    fileType: input.fileType!,
    contentType: input.contentType!.slice(0, 120),
    quarantineDownloadUrl: input.quarantineDownloadUrl!,
    cleanUploadUrl: input.cleanUploadUrl!,
    derivedUploadUrl: input.derivedUploadUrl || null,
  };
}

function assertAllowedStorageUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Storage URL must use HTTPS.");
  const allowed = new Set(
    (process.env.FILE_WORKER_STORAGE_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => new URL(origin).origin),
  );
  if (!allowed.has(url.origin)) throw new Error("Storage URL origin is not allowed.");
}

async function downloadBounded(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new WorkerFailure("quarantine_download_failed");
  const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_SIZE_BYTES) {
    throw new WorkerFailure("quarantine_object_too_large");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_SIZE_BYTES) {
    throw new WorkerFailure("quarantine_object_too_large");
  }
  return bytes;
}

async function uploadSigned(url: string, bytes: Buffer, contentType: string) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new WorkerFailure("clean_object_upload_failed");
}

async function scanWithClamAv(sourcePath: string): Promise<{
  status: "clean" | "infected" | "failed";
  result: string;
  signatureVersion: string | null;
  failureCode: string | null;
}> {
  const signatureVersion = await clamAvVersion();
  try {
    await execFileAsync("clamscan", ["--infected", "--no-summary", sourcePath], {
      timeout: 5 * 60_000,
      maxBuffer: 256 * 1024,
    });
    return {
      status: "clean",
      result: "no_threats_found",
      signatureVersion,
      failureCode: null,
    };
  } catch (error) {
    const code = (error as { code?: number | string }).code;
    const stdout = String((error as { stdout?: string }).stdout ?? "");
    if (code === 1 || code === "1") {
      const match = stdout.match(/:\s*([^\r\n]+?)\s+FOUND/i);
      return {
        status: "infected",
        result: (match?.[1] ?? "threat_found").slice(0, 120),
        signatureVersion,
        failureCode: null,
      };
    }
    return {
      status: "failed",
      result: "scanner_error",
      signatureVersion,
      failureCode: code === "ENOENT" ? "scanner_unavailable" : "scanner_error",
    };
  }
}

async function clamAvVersion() {
  try {
    const { stdout } = await execFileAsync("clamscan", ["--version"], {
      timeout: 10_000,
      maxBuffer: 16 * 1024,
    });
    return stdout.trim().slice(0, 120) || null;
  } catch {
    return null;
  }
}

async function countPdfPages(bytes: Buffer): Promise<number | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs" as string);
    const document = await (
      pdfjs as unknown as {
        getDocument: (options: unknown) => {
          promise: Promise<{ numPages: number }>;
        };
      }
    ).getDocument({ data: new Uint8Array(bytes) }).promise;
    return document.numPages;
  } catch {
    return null;
  }
}

function safeEqual(expected: string, supplied: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function safeExtension(value: string) {
  return /^[a-z0-9]{1,16}$/.test(value) ? value : "bin";
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 160) : "Invalid request.";
}

class WorkerFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "WorkerFailure";
  }
}
