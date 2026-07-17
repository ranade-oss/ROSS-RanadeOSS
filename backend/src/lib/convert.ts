import JSZip from "jszip";
import fs from "node:fs";
import path from "node:path";

let _convert:
  | ((buf: Buffer, ext: string, filter: undefined) => Promise<Buffer>)
  | null = null;
let _sofficeBinaryPaths: string[] | null = null;
const CONVERSION_TIMEOUT_MS = 60_000;
const MAX_CONVERSION_OUTPUT_BYTES = 100 * 1024 * 1024;
const MAX_CONCURRENT_CONVERSIONS = 2;
const MAX_QUEUED_CONVERSIONS = 8;
let activeConversions = 0;
const conversionQueue: Array<() => void> = [];

function executablePath(filePath: string) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveSofficeBinaryPaths(): string[] {
  if (_sofficeBinaryPaths) return _sofficeBinaryPaths;

  const candidates = new Set<string>();
  for (const envName of [
    "SOFFICE_BINARY_PATH",
    "LIBREOFFICE_BINARY_PATH",
    "LIBRE_OFFICE_EXE",
  ]) {
    const value = process.env[envName]?.trim();
    if (value) candidates.add(value);
  }

  const pathDirs = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  for (const dir of pathDirs) {
    candidates.add(path.join(dir, "soffice"));
    candidates.add(path.join(dir, "libreoffice"));
  }

  for (const filePath of [
    "/usr/bin/libreoffice",
    "/usr/bin/soffice",
    "/snap/bin/libreoffice",
    "/opt/libreoffice/program/soffice",
    "/opt/libreoffice7.6/program/soffice",
  ]) {
    candidates.add(filePath);
  }

  _sofficeBinaryPaths = [...candidates].filter(executablePath);
  return _sofficeBinaryPaths;
}

async function getConvert() {
  if (!_convert) {
    const libre = await import("libreoffice-convert");
    const convertWithOptions = libre.default.convertWithOptions.bind(
      libre.default,
    ) as (
      buf: Buffer,
      ext: string,
      filter: undefined,
      options: {
        sofficeBinaryPaths?: string[];
        execOptions?: {
          timeout?: number;
          maxBuffer?: number;
          killSignal?: NodeJS.Signals;
          windowsHide?: boolean;
        };
        sofficeAdditionalArgs?: string[];
      },
      callback?: (err: Error | null, result: Buffer) => void,
    ) => Promise<Buffer> | void;
    _convert = (buf, ext, filter) =>
      new Promise<Buffer>((resolve, reject) => {
        try {
          const maybePromise = convertWithOptions(
            buf,
            ext,
            filter,
            {
              sofficeBinaryPaths: resolveSofficeBinaryPaths(),
              execOptions: {
                timeout: CONVERSION_TIMEOUT_MS,
                maxBuffer: 1024 * 1024,
                killSignal: "SIGKILL",
                windowsHide: true,
              },
              sofficeAdditionalArgs: [
                "--norestore",
                "--nodefault",
                "--nolockcheck",
                "--nofirststartwizard",
              ],
            },
            (err, result) => {
              if (err) reject(err);
              else resolve(result);
            },
          );
          if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise.then(resolve, reject);
          }
        } catch (err) {
          reject(err);
        }
      });
  }
  return _convert;
}

/**
 * Some older Windows/Word archives store .docx entries with backslash
 * separators (e.g. `word\document.xml`). Mammoth and LibreOffice both look
 * up entries by exact string and miss those files, producing empty output
 * or conversion failures. Rewrite any such entries to the canonical
 * forward-slash form before handing the buffer off.
 */
export async function normalizeDocxZipPaths(buffer: Buffer): Promise<Buffer> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return buffer;
  }
  const renames: [string, string][] = [];
  zip.forEach((relativePath) => {
    if (relativePath.includes("\\")) {
      renames.push([relativePath, relativePath.replace(/\\/g, "/")]);
    }
  });
  if (renames.length === 0) return buffer;
  for (const [oldPath, newPath] of renames) {
    const entry = zip.file(oldPath);
    if (!entry) continue;
    const content = await entry.async("nodebuffer");
    zip.remove(oldPath);
    zip.file(newPath, content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

/**
 * Convert a DOCX/DOC buffer to PDF using LibreOffice.
 * Throws if LibreOffice is not installed or conversion fails.
 */
export async function docxToPdf(buffer: Buffer): Promise<Buffer> {
  if (resolveSofficeBinaryPaths().length === 0) {
    throw new Error(
      "LibreOffice/soffice binary was not found. Ensure Railway uses backend/nixpacks.toml or set SOFFICE_BINARY_PATH/LIBREOFFICE_BINARY_PATH.",
    );
  }
  const release = await acquireConversionSlot();
  try {
    const convert = await getConvert();
    const normalized = await normalizeDocxZipPaths(buffer);
    const result = await convert(normalized, ".pdf", undefined);
    if (result.length > MAX_CONVERSION_OUTPUT_BYTES) {
      throw new Error("Converted PDF exceeds the maximum permitted size.");
    }
    if (!result.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("LibreOffice returned an invalid PDF result.");
    }
    return result;
  } finally {
    release();
  }
}

async function acquireConversionSlot() {
  if (activeConversions < MAX_CONCURRENT_CONVERSIONS) {
    activeConversions += 1;
    return releaseConversionSlot;
  }
  if (conversionQueue.length >= MAX_QUEUED_CONVERSIONS) {
    throw new Error("Document conversion capacity is temporarily full.");
  }
  await new Promise<void>((resolve) => conversionQueue.push(resolve));
  activeConversions += 1;
  return releaseConversionSlot;
}

function releaseConversionSlot() {
  activeConversions = Math.max(0, activeConversions - 1);
  conversionQueue.shift()?.();
}

export function convertedPdfKey(userId: string, docId: string): string {
  return `converted-pdfs/${userId}/${docId}.pdf`;
}
