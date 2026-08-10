import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));

test("the upload parser stays on the supported Multer major", () => {
  const backend = readJson("backend/package.json");
  const version = backend.dependencies.multer;

  assert.match(version, /^\^2\./);
});
