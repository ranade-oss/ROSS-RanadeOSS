import JSZip from "jszip";
import { ALLOWED_DOCUMENT_TYPES } from "./documentTypes";

const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
];
const OLE_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);
const MAX_OFFICE_ARCHIVE_ENTRIES = 5_000;
const HOSTED_BLOCKED_TYPES = new Set(["doc", "xls", "xlsm", "ppt"]);

export class UploadValidationError extends Error {
  constructor(
    message: string,
    readonly status = 415,
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export async function validateUploadedDocument(
  file: Pick<Express.Multer.File, "buffer" | "originalname">,
) {
  return validateDocument(file, process.env.ROSS_UPLOAD_SCAN_REQUIRED !== "true");
}

// Called only inside the isolated worker after ClamAV reports the object clean.
// Hosted API processes deliberately avoid opening an unscanned Office archive.
export async function validateScannedDocument(
  file: Pick<Express.Multer.File, "buffer" | "originalname">,
) {
  return validateDocument(file, true);
}

async function validateDocument(
  file: Pick<Express.Multer.File, "buffer" | "originalname">,
  inspectOfficeArchive: boolean,
) {
  const extension = fileExtension(file.originalname);
  if (!extension || !ALLOWED_DOCUMENT_TYPES.has(extension)) {
    throw new UploadValidationError(
      "The uploaded filename does not contain a supported document extension.",
    );
  }
  if (strictHostedUploads() && HOSTED_BLOCKED_TYPES.has(extension)) {
    throw new UploadValidationError(
      `.${extension} files are not accepted by hosted ROSS. Save the document as PDF, DOCX, XLSX, or PPTX and upload it again.`,
    );
  }

  if (extension === "pdf") {
    if (!file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw signatureMismatch(extension);
    }
    return;
  }

  if (["doc", "xls", "ppt"].includes(extension)) {
    if (!file.buffer.subarray(0, OLE_SIGNATURE.length).equals(OLE_SIGNATURE)) {
      throw signatureMismatch(extension);
    }
    return;
  }

  if (!ZIP_SIGNATURES.some((signature) => startsWith(file.buffer, signature))) {
    throw signatureMismatch(extension);
  }

  if (!inspectOfficeArchive) return;

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file.buffer);
  } catch {
    throw new UploadValidationError(
      `The .${extension} file is not a readable Office document archive.`,
    );
  }
  const entries = Object.keys(zip.files);
  if (entries.length > MAX_OFFICE_ARCHIVE_ENTRIES) {
    throw new UploadValidationError(
      `The Office document contains too many archive entries (${entries.length}).`,
    );
  }
  if (
    entries.some(
      (entry) =>
        entry.includes("\\") ||
        entry.startsWith("/") ||
        entry.split("/").includes(".."),
    )
  ) {
    throw new UploadValidationError(
      "The Office document contains an unsafe archive path.",
    );
  }
  if (
    entries.some((entry) => /(^|\/)vbaProject(?:Signature)?\.bin$/i.test(entry))
  ) {
    throw new UploadValidationError(
      "Macro-enabled Office documents are not accepted by hosted ROSS.",
    );
  }

  const requiredEntry =
    extension === "docx"
      ? "word/document.xml"
      : extension === "pptx"
        ? "ppt/presentation.xml"
        : "xl/workbook.xml";
  if (!zip.file("[Content_Types].xml") || !zip.file(requiredEntry)) {
    throw signatureMismatch(extension);
  }
}

function strictHostedUploads() {
  const mode = process.env.ROSS_HOSTED_MODE?.trim().toLowerCase();
  return mode === "controlled-beta" || mode === "production";
}

function fileExtension(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot < 0
    ? ""
    : filename
        .slice(dot + 1)
        .trim()
        .toLowerCase();
}

function startsWith(value: Buffer, prefix: Buffer) {
  return (
    value.length >= prefix.length &&
    value.subarray(0, prefix.length).equals(prefix)
  );
}

function signatureMismatch(extension: string) {
  return new UploadValidationError(
    `The uploaded bytes do not match the .${extension} file extension.`,
  );
}
