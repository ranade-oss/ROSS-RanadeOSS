import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("the submitted jurisdiction survives the first-prompt route transition", () => {
  const hook = read("frontend/src/app/hooks/useSelectedJurisdiction.ts");
  const input = read("frontend/src/app/components/assistant/ChatInput.tsx");
  const project = read(
    "frontend/src/app/(pages)/projects/[id]/assistant/chat/[chatId]/page.tsx",
  );

  assert.match(hook, /sessionStorage\.setItem\(storageKey, next\)/);
  assert.match(hook, /jurisdiction === "CA-ON" \? \["CA-ON", "CA"\]/);
  assert.match(input, /jurisdictions: jurisdictionCodes\(jurisdiction\)/);
  assert.doesNotMatch(input, /jurisdictionOverride/);
  assert.match(
    project,
    /jurisdictionPersistenceScope=\{`project:\$\{projectId\}`\}/,
  );
});

test("live provider models remain selectable without a hardcoded UI ID", () => {
  const selectedModel = read("frontend/src/app/hooks/useSelectedModel.ts");
  const catalog = read("frontend/src/app/hooks/useModelCatalog.ts");
  const backend = read("backend/src/lib/llm/modelDiscovery.ts");

  assert.match(selectedModel, /isSelectableModelId/);
  assert.doesNotMatch(selectedModel, /ALLOWED_MODEL_IDS\.has/);
  assert.match(catalog, /provider,/);
  assert.match(backend, /listed\.filter\(adapter\.compatible\)/);
  assert.match(backend, /models\.push\(liveModel\(model, provider\)\)/);
});
