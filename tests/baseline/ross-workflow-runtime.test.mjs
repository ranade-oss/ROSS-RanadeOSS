import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("Assistant runtime registers inherited Mike and Ontario ROSS workflows", () => {
  const builder = read("backend/src/lib/chat/contextBuilders.ts");

  assert.match(builder, /SYSTEM_ASSISTANT_WORKFLOWS/);
  assert.match(builder, /ROSS_SYSTEM_WORKFLOWS/);
  assert.match(builder, /wf\.metadata\.type === "assistant"/);
  assert.match(builder, /store\.set\(wf\.id/);
});

test("workflow auto-launch carries the user's selected model", () => {
  const modal = read(
    "frontend/src/app/components/workflows/UseWorkflowModal.tsx",
  );

  assert.match(modal, /useSelectedModel/);
  assert.match(modal, /workflow:\s*\{ id: wf\.id, title: wf\.metadata\.title \}/);
  assert.match(modal, /workflow:[\s\S]{0,500}\bmodel,/);
});
