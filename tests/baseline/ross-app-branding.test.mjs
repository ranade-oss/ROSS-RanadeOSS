import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));

test("the authenticated app derives public identity from the ROSS configuration", () => {
  const brandModule = read("frontend/src/app/lib/rossBrand.ts");
  const layout = read("frontend/src/app/layout.tsx");
  assert.match(brandModule, /config\/ross-brand\.json/);
  assert.match(layout, /rossBrand\.name/);
  assert.match(layout, /ross-social-card\.png/);
  assert.doesNotMatch(layout, /mikeoss\.com|link-image\.jpg/);
});

test("the authenticated app ships original ROSS visual assets", () => {
  for (const path of [
    "frontend/src/app/icon.svg",
    "frontend/src/app/components/chat/ross-icon.tsx",
    "frontend/public/ross-social-card.svg",
    "frontend/public/ross-social-card.png",
  ]) assert.equal(existsSync(resolve(root, path)), true, path);
  assert.equal(existsSync(resolve(root, "frontend/src/app/favicon.ico")), false);
  assert.equal(existsSync(resolve(root, "frontend/public/link-image.jpg")), false);
  assert.match(read("frontend/src/app/icon.svg"), /#102A43/i);
  assert.match(read("frontend/src/app/icon.svg"), /#0F8B8D/i);
});

test("visible authenticated-app copy uses ROSS", () => {
  const visible = [
    "frontend/src/app/components/shared/AppSidebar.tsx",
    "frontend/src/app/components/site-logo.tsx",
    "frontend/src/app/signup/page.tsx",
    "frontend/src/app/support/page.tsx",
    "frontend/src/app/global-error.tsx",
    "frontend/src/app/(pages)/account/api-keys/page.tsx",
    "frontend/src/app/(pages)/account/security/page.tsx",
  ].map(read).join("\n");
  assert.match(visible, /ROSS/);
  assert.doesNotMatch(visible, /\bMike\b|mikeoss\.com/);
});

test("compatibility identifiers and upstream attribution remain intact", () => {
  const compatibility = [
    read("frontend/src/app/hooks/useSelectedModel.ts"),
    read("frontend/src/app/components/shared/MfaLoginGate.tsx"),
    read("frontend/src/app/components/shared/RowActions.tsx"),
    read("frontend/src/app/components/projects/ProjectDocumentsView.tsx"),
  ].join("\n");
  assert.match(compatibility, /mike\.selectedModel/);
  assert.match(compatibility, /mike:mfa-verified-at/);
  assert.match(compatibility, /mike:close-row-actions/);
  assert.match(compatibility, /application\/mike-doc/);
  const attribution = read("frontend/src/app/components/workflows/OpenSourceWorkflowModal.tsx");
  assert.match(attribution, /Open-Legal-Products\/mike-workflows/);
  assert.match(attribution, /upstream Mike website/);
  assert.match(read("frontend/src/app/components/chat/mike-icon.tsx"), /compatibility re-export/i);
});

test("the frontend package now identifies as the ROSS app", () => {
  assert.equal(json("frontend/package.json").name, "ross-app");
  assert.equal(json("frontend/package-lock.json").name, "ross-app");
  assert.match(read("frontend/bun.lock"), /name = "ross-app"|"name": "ross-app"/);
});
