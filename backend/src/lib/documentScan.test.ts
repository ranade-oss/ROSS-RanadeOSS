import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkerResult } from "./documentScanDispatcher";
import {
  cleanStorageKey,
  derivedPdfStorageKey,
  quarantineStorageKey,
} from "./storage";

test("scan pipeline assigns separate quarantine, clean, and derived prefixes", () => {
  assert.equal(
    quarantineStorageKey("user", "document", "version", "Pleading.DOCX"),
    "quarantine/user/document/version.docx",
  );
  assert.equal(
    cleanStorageKey("user", "document", "version", "Pleading.DOCX"),
    "clean/user/document/version.docx",
  );
  assert.equal(
    derivedPdfStorageKey("user", "document", "version"),
    "derived/user/document/version.pdf",
  );
});

test("dispatcher accepts a bounded ClamAV clean result", () => {
  assert.deepEqual(
    validateWorkerResult({
      status: "clean",
      engine: "clamav",
      result: "no_threats_found",
      sha256: "a".repeat(64),
      signatureVersion: "ClamAV 1.4",
      pageCount: 2,
      derivedCreated: true,
      failureCode: null,
    }),
    {
      status: "clean",
      engine: "clamav",
      result: "no_threats_found",
      sha256: "a".repeat(64),
      signatureVersion: "ClamAV 1.4",
      pageCount: 2,
      derivedCreated: true,
      failureCode: null,
    },
  );
});

test("dispatcher rejects an untrusted worker result", () => {
  assert.throws(
    () =>
      validateWorkerResult({
        status: "clean",
        engine: "untrusted-scanner",
        result: "clean",
        sha256: "",
        derivedCreated: false,
      }),
    /Invalid worker result/,
  );
});
