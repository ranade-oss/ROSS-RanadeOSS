import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  UploadValidationError,
  validateScannedDocument,
  validateUploadedDocument,
} from "./uploadValidation";

test("upload validation rejects an extension that does not match the bytes", async () => {
  await assert.rejects(
    validateUploadedDocument({
      originalname: "pleading.pdf",
      buffer: Buffer.from("not a PDF"),
    }),
    (error: unknown) =>
      error instanceof UploadValidationError &&
      /do not match the \.pdf file extension/.test(error.message),
  );
});

test("hosted API defers Office archive parsing until the post-scan worker", async () => {
  const previousMode = process.env.ROSS_HOSTED_MODE;
  const previousScan = process.env.ROSS_UPLOAD_SCAN_REQUIRED;
  process.env.ROSS_HOSTED_MODE = "controlled-beta";
  process.env.ROSS_UPLOAD_SCAN_REQUIRED = "true";
  try {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types />");
    zip.file("xl/workbook.xml", "<workbook />");
    zip.file("xl/vbaProject.bin", "synthetic macro placeholder");
    const file = {
      originalname: "review.xlsx",
      buffer: await zip.generateAsync({ type: "nodebuffer" as const }),
    };
    await validateUploadedDocument(file);
    await assert.rejects(
      validateScannedDocument(file),
      /Macro-enabled Office documents/,
    );
  } finally {
    if (previousMode === undefined) delete process.env.ROSS_HOSTED_MODE;
    else process.env.ROSS_HOSTED_MODE = previousMode;
    if (previousScan === undefined) delete process.env.ROSS_UPLOAD_SCAN_REQUIRED;
    else process.env.ROSS_UPLOAD_SCAN_REQUIRED = previousScan;
  }
});

test("upload validation accepts a structurally identified DOCX archive", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types />");
  zip.file("word/document.xml", "<document />");
  await validateUploadedDocument({
    originalname: "pleading.docx",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
});

test("hosted upload validation rejects macro-enabled spreadsheets", async () => {
  const previous = process.env.ROSS_HOSTED_MODE;
  process.env.ROSS_HOSTED_MODE = "controlled-beta";
  try {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types />");
    zip.file("xl/workbook.xml", "<workbook />");
    zip.file("xl/vbaProject.bin", "synthetic macro placeholder");
    await assert.rejects(
      validateUploadedDocument({
        originalname: "review.xlsx",
        buffer: await zip.generateAsync({ type: "nodebuffer" }),
      }),
      (error: unknown) =>
        error instanceof UploadValidationError &&
        /Macro-enabled Office documents/.test(error.message),
    );
  } finally {
    if (previous === undefined) delete process.env.ROSS_HOSTED_MODE;
    else process.env.ROSS_HOSTED_MODE = previous;
  }
});
