import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("controlled-beta direct mutations carry the data-boundary acknowledgement", () => {
  for (const path of [
    "frontend/src/app/components/assistant/message/EditCardsSection.tsx",
    "frontend/src/app/components/assistant/EditCard.tsx",
    "frontend/src/app/components/assistant/TrackedChangeHeader.tsx",
  ]) {
    assert.match(read(path), /dataBoundaryHeaders\(\)/, path);
  }
  const api = read("frontend/src/app/lib/mikeApi.ts");
  const projectStream =
    api.match(
      /export async function streamProjectChat[\s\S]*?(?=\/\/ ---------------------------------------------------------------------------)/,
    )?.[0] ?? "";
  assert.match(projectStream, /dataBoundaryHeaders\(\)/);
});

test("hosted model policy is enforced by the backend and consumed by the UI", () => {
  assert.match(
    read("backend/src/lib/llm/runtimeModels.ts"),
    /hostedModelProviders/,
  );
  assert.match(read("backend/src/routes/chat.ts"), /isModelApprovedForRuntime/);
  assert.match(
    read("backend/src/routes/projectChat.ts"),
    /isModelApprovedForRuntime/,
  );
  assert.match(read("backend/src/routes/user.ts"), /isModelApprovedForRuntime/);
  assert.match(
    read("frontend/src/app/hooks/useModelCatalog.ts"),
    /approvedProviders/,
  );
});

test("project chats inherit the project's legal jurisdictions", () => {
  assert.match(
    read("backend/src/routes/projectChat.ts"),
    /projectAccess\.project\.jurisdictions/,
  );
  assert.match(
    read(
      "frontend/src/app/(pages)/projects/[id]/assistant/chat/[chatId]/page.tsx",
    ),
    /defaultJurisdictions=\{project\?\.jurisdictions\}/,
  );
});

test("every model adapter reserves a tool-free final synthesis turn", () => {
  for (const path of [
    "backend/src/lib/llm/openai.ts",
    "backend/src/lib/llm/claude.ts",
    "backend/src/lib/llm/gemini.ts",
  ]) {
    const adapter = read(path);
    assert.match(adapter, /iter <= maxIter/, path);
    assert.match(adapter, /toolsEnabled/, path);
  }
});
