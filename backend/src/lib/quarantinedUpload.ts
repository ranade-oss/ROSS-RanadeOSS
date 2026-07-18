import crypto from "node:crypto";
import type { createServerSupabase } from "./supabase";
import {
  cleanStorageKey,
  deleteFile,
  derivedPdfStorageKey,
  quarantineStorageKey,
  uploadFile,
} from "./storage";
import { shouldConvertToPdf } from "./documentTypes";
import { docxToPdf } from "./convert";
import type { DocumentScanStatus } from "./documentScanTypes";

type Supa = ReturnType<typeof createServerSupabase>;

type QueueUploadedVersionArgs = {
  db: Supa;
  documentId: string;
  userId: string;
  bytes: Buffer;
  originalFilename: string;
  displayFilename: string;
  fileType: string;
  contentType: string;
  source: "upload" | "user_upload";
  versionNumber: number;
  replaceVersionId?: string | null;
};

type PreviousVersion = {
  storage_path: string | null;
  pdf_storage_path: string | null;
  scan_status: DocumentScanStatus | null;
};

export async function queueUploadedVersion(args: QueueUploadedVersionArgs) {
  const versionId = args.replaceVersionId || crypto.randomUUID();
  const { data: document, error: documentError } = await args.db
    .from("documents")
    .select("current_version_id")
    .eq("id", args.documentId)
    .single();
  if (documentError || !document) {
    throw new Error("Document not found while queuing an uploaded version.");
  }

  let previousVersion: PreviousVersion | null = null;
  if (args.replaceVersionId) {
    const { data, error } = await args.db
      .from("document_versions")
      .select("storage_path, pdf_storage_path, scan_status")
      .eq("id", args.replaceVersionId)
      .eq("document_id", args.documentId)
      .single();
    if (error || !data) {
      throw new Error("Version not found while queuing replacement bytes.");
    }
    previousVersion = data as PreviousVersion;
  }

  if (process.env.ROSS_UPLOAD_SCAN_REQUIRED !== "true") {
    return storeTrustedSelfHostedVersion(
      args,
      versionId,
      previousVersion,
    );
  }

  const quarantinePath = quarantineStorageKey(
    args.userId,
    args.documentId,
    versionId,
    args.originalFilename,
  );
  const cleanPath = cleanStorageKey(
    args.userId,
    args.documentId,
    versionId,
    args.originalFilename,
  );
  const derivedPath = shouldConvertToPdf(args.fileType)
    ? derivedPdfStorageKey(args.userId, args.documentId, versionId)
    : null;

  await uploadFile(
    quarantinePath,
    args.bytes.buffer.slice(
      args.bytes.byteOffset,
      args.bytes.byteOffset + args.bytes.byteLength,
    ) as ArrayBuffer,
    args.contentType,
  );

  const pendingValues = {
    quarantine_storage_path: quarantinePath,
    scan_status: "pending",
    scan_engine: null,
    scan_signature_version: null,
    scan_result: null,
    scan_sha256: null,
    scan_started_at: null,
    scan_completed_at: null,
    scan_failure_code: null,
    filename: args.displayFilename,
    file_type: args.fileType,
    size_bytes: args.bytes.byteLength,
    page_count: null,
  } as const;

  let versionError: { message?: string } | null = null;
  if (args.replaceVersionId) {
    // Keep the previously clean bytes active while replacement bytes are
    // quarantined, but mark the version pending so every read path fails
    // closed. The dispatcher swaps paths only after a clean scan.
    const { error } = await args.db
      .from("document_versions")
      .update({
        quarantine_storage_path: quarantinePath,
        scan_status: "pending",
        scan_started_at: null,
        scan_failure_code: null,
      })
      .eq("id", versionId)
      .eq("document_id", args.documentId);
    versionError = error;
  } else {
    const { error } = await args.db.from("document_versions").insert({
      id: versionId,
      document_id: args.documentId,
      storage_path: null,
      pdf_storage_path: null,
      source: args.source,
      version_number: args.versionNumber,
      ...pendingValues,
    });
    versionError = error;
  }

  if (versionError) {
    await deleteFile(quarantinePath).catch(() => {});
    throw new Error(
      `Failed to create pending document version: ${versionError.message ?? "unknown"}`,
    );
  }

  const { error: jobError } = await args.db.from("document_scan_jobs").upsert(
    {
      document_id: args.documentId,
      version_id: versionId,
      user_id: args.userId,
      quarantine_storage_path: quarantinePath,
      clean_storage_path: cleanPath,
      derived_storage_path: derivedPath,
      filename: args.displayFilename,
      file_type: args.fileType,
      size_bytes: args.bytes.byteLength,
      content_type: args.contentType,
      status: "queued",
      attempts: 0,
      available_at: new Date().toISOString(),
      locked_at: null,
      completed_at: null,
      last_error_code: null,
      previous_storage_path: previousVersion?.storage_path ?? null,
      previous_pdf_storage_path: previousVersion?.pdf_storage_path ?? null,
      previous_current_version_id:
        (document.current_version_id as string | null) ?? null,
      previous_scan_status: previousVersion?.scan_status ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "version_id" },
  );
  if (jobError) {
    await rollbackPendingVersion(args, versionId, previousVersion);
    await deleteFile(quarantinePath).catch(() => {});
    throw new Error(`Failed to queue document scan: ${jobError.message}`);
  }

  const { error: documentUpdateError } = await args.db
    .from("documents")
    .update({
      current_version_id: versionId,
      status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.documentId);
  if (documentUpdateError) {
    await args.db.from("document_scan_jobs").delete().eq("version_id", versionId);
    await rollbackPendingVersion(args, versionId, previousVersion);
    await deleteFile(quarantinePath).catch(() => {});
    throw new Error(
      `Failed to activate pending document version: ${documentUpdateError.message}`,
    );
  }

  return {
    id: versionId,
    version_number: args.versionNumber,
    source: args.source,
    filename: args.displayFilename,
    file_type: args.fileType,
    size_bytes: args.bytes.byteLength,
    page_count: null,
    storage_path: null,
    pdf_storage_path: null,
    scan_status: "pending" as const,
  };
}

async function storeTrustedSelfHostedVersion(
  args: QueueUploadedVersionArgs,
  versionId: string,
  previousVersion: PreviousVersion | null,
) {
  const cleanPath = cleanStorageKey(
    args.userId,
    args.documentId,
    versionId,
    args.originalFilename,
  );
  await uploadFile(
    cleanPath,
    args.bytes.buffer.slice(
      args.bytes.byteOffset,
      args.bytes.byteOffset + args.bytes.byteLength,
    ) as ArrayBuffer,
    args.contentType,
  );

  let pdfStoragePath: string | null = null;
  let pageCount: number | null = null;
  if (args.fileType === "pdf") {
    pdfStoragePath = cleanPath;
    pageCount = await countPdfPages(args.bytes);
  } else if (shouldConvertToPdf(args.fileType)) {
    try {
      const pdf = await docxToPdf(args.bytes);
      const derivedPath = derivedPdfStorageKey(
        args.userId,
        args.documentId,
        versionId,
      );
      await uploadFile(
        derivedPath,
        pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer,
        "application/pdf",
      );
      pdfStoragePath = derivedPath;
      pageCount = await countPdfPages(pdf);
    } catch (error) {
      console.warn("[upload] self-hosted PDF rendition failed", {
        documentId: args.documentId,
        message: error instanceof Error ? error.message.slice(0, 160) : "unknown",
      });
    }
  }

  const values = {
    storage_path: cleanPath,
    pdf_storage_path: pdfStoragePath,
    quarantine_storage_path: null,
    scan_status: "clean",
    scan_engine: "self-hosted-trusted",
    scan_signature_version: null,
    scan_result: "operator_managed",
    scan_completed_at: new Date().toISOString(),
    scan_failure_code: null,
    filename: args.displayFilename,
    file_type: args.fileType,
    size_bytes: args.bytes.byteLength,
    page_count: pageCount,
  } as const;

  const operation = args.replaceVersionId
    ? args.db
        .from("document_versions")
        .update(values)
        .eq("id", versionId)
        .eq("document_id", args.documentId)
    : args.db.from("document_versions").insert({
        id: versionId,
        document_id: args.documentId,
        source: args.source,
        version_number: args.versionNumber,
        ...values,
      });
  const { error } = await operation;
  if (error) {
    await Promise.all(
      [cleanPath, pdfStoragePath]
        .filter((path): path is string => Boolean(path))
        .map((path) => deleteFile(path).catch(() => {})),
    );
    throw new Error(`Failed to save self-hosted document version: ${error.message}`);
  }

  await args.db.from("documents").update({
    current_version_id: versionId,
    status: "ready",
    updated_at: new Date().toISOString(),
  }).eq("id", args.documentId);

  await Promise.all(
    [previousVersion?.storage_path, previousVersion?.pdf_storage_path]
      .filter((path): path is string => Boolean(path) && path !== cleanPath && path !== pdfStoragePath)
      .map((path) => deleteFile(path).catch(() => {})),
  );

  return {
    id: versionId,
    version_number: args.versionNumber,
    source: args.source,
    filename: args.displayFilename,
    file_type: args.fileType,
    size_bytes: args.bytes.byteLength,
    page_count: pageCount,
    storage_path: cleanPath,
    pdf_storage_path: pdfStoragePath,
    scan_status: "clean" as const,
  };
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

async function rollbackPendingVersion(
  args: QueueUploadedVersionArgs,
  versionId: string,
  previousVersion: PreviousVersion | null,
) {
  if (!args.replaceVersionId) {
    await args.db.from("document_versions").delete().eq("id", versionId);
    return;
  }
  await args.db
    .from("document_versions")
    .update({
      quarantine_storage_path: null,
      scan_status: previousVersion?.scan_status ?? "clean",
      scan_started_at: null,
    })
    .eq("id", versionId);
}
