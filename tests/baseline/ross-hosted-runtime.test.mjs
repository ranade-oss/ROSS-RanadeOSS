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

test("shared dialogs and warnings expose keyboard and live-region semantics", () => {
  const modal = read("frontend/src/app/components/modals/Modal.tsx");
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /previouslyFocused\?\.focus\(\)/);
  assert.match(modal, /element\.inert = true/);

  const warning = read("frontend/src/app/components/popups/WarningPopup.tsx");
  assert.match(warning, /role="alert"/);
  assert.match(warning, /aria-live="assertive"/);
});

test("model availability explains entitlement separately from missing keys", () => {
  const discovery = read("backend/src/lib/llm/modelDiscovery.ts");
  assert.match(discovery, /availabilityReason/);
  assert.match(discovery, /does not currently list this model as available/);

  const toggle = read(
    "frontend/src/app/components/assistant/ModelToggle.tsx",
  );
  assert.match(toggle, /selectedUnavailableReason/);
  assert.doesNotMatch(toggle, /API key missing for selected model/);
});

test("hosted uploads are bounded and validated against their file containers", () => {
  const upload = read("backend/src/lib/upload.ts");
  assert.match(upload, /25 \* 1024 \* 1024/);
  assert.match(upload, /validateUploadedDocument/);

  const validation = read("backend/src/lib/uploadValidation.ts");
  assert.match(validation, /vbaProject/);
  assert.match(validation, /MAX_OFFICE_ARCHIVE_ENTRIES/);
  assert.match(validation, /strictHostedUploads/);

  const conversion = read("backend/src/lib/convert.ts");
  assert.match(conversion, /CONVERSION_TIMEOUT_MS = 60_000/);
  assert.match(conversion, /MAX_CONCURRENT_CONVERSIONS = 2/);
  assert.match(conversion, /SIGKILL/);
  assert.match(conversion, /LibreOffice returned an invalid PDF result/);
});

test("release checks reject high dependency advisories and deployments retry transient Fly failures", () => {
  const rootPackage = JSON.parse(read("package.json"));
  assert.equal(rootPackage.scripts["audit:high"], "node scripts/audit-workspaces.mjs");
  assert.match(rootPackage.scripts.check, /npm run audit:high/);

  const audit = read("scripts/audit-workspaces.mjs");
  assert.match(audit, /--audit-level=high/);
  for (const workspace of ["backend", "frontend", "website"]) {
    assert.match(audit, new RegExp(`["']${workspace}["']`));
  }
  assert.doesNotMatch(audit, /&&/);
  assert.match(audit, /failures\.length > 0/);

  const retry = read("scripts/fly-deploy-with-retry.sh");
  assert.match(retry, /FLY_DEPLOY_ATTEMPTS:-3/);
  for (const path of [
    ".github/workflows/deploy-private-ross.yml",
    ".github/workflows/deploy-public-beta-ross.yml",
  ]) {
    assert.match(read(path), /scripts\/fly-deploy-with-retry\.sh/);
  }
});
