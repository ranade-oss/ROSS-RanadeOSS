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

test("workflow intake responses preserve the selected model", () => {
  const chatView = read(
    "frontend/src/app/components/assistant/ChatView.tsx",
  );

  assert.match(chatView, /useSelectedModel/);
  assert.match(chatView, /continuationModel/);
  assert.match(
    chatView,
    /model:\s*continuationModel[\s\S]{0,300}askInputsResponse:\s*response/,
  );
});

test("legal-source coverage uses the dashboard contract without crashing Features", () => {
  const route = read("backend/src/routes/legalSources.ts");
  const api = read("frontend/src/app/lib/mikeApi.ts");

  assert.match(route, /legalSourcesRouter\.get\("\/coverage"[\s\S]*res\.json\(\{[\s\S]*\bcoverage,/);
  assert.match(api, /coverageResponse\.coverage\s*\?\?/);
  assert.match(api, /coverageResponse\.providers\s*\?\?/);
});
