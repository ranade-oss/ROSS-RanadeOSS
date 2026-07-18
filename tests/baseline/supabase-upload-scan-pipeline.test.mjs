import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("Supabase scan jobs are private, persistent, and claimed atomically", () => {
  const migration = read("backend/migrations/20260718_01_document_scan_pipeline.sql");
  for (const state of ["pending", "clean", "infected", "failed"]) {
    assert.match(migration, new RegExp(`'${state}'`));
  }
  assert.match(migration, /document_scan_jobs/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.document_scan_jobs FROM anon, authenticated/i);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/i);
  assert.match(migration, /SECURITY DEFINER/i);
});

test("hosted uploads are quarantined and every object read fails closed", () => {
  const queuedUpload = read("backend/src/lib/quarantinedUpload.ts");
  const versions = read("backend/src/lib/documentVersions.ts");
  const downloads = read("backend/src/routes/downloads.ts");
  const projects = read("backend/src/routes/projects.ts");
  assert.match(queuedUpload, /quarantineStorageKey/);
  assert.match(queuedUpload, /scan_status:\s*"pending"/);
  assert.match(versions, /\.eq\("scan_status", "clean"\)/);
  assert.match(downloads, /\.eq\("scan_status", "clean"\)/);
  assert.match(projects, /\.eq\("scan_status", "clean"\)/);
});

test("private worker scans before structure validation, promotion, or conversion", () => {
  const worker = read("backend/src/fileWorker.ts");
  const scanAt = worker.indexOf("scanWithClamAv(sourcePath)");
  const validateAt = worker.indexOf("await validateScannedDocument");
  const promoteAt = worker.indexOf("uploadSigned(input.cleanUploadUrl");
  const convertAt = worker.indexOf("docxToPdf(bytes)");
  assert.ok(scanAt > 0);
  assert.ok(validateAt > scanAt);
  assert.ok(promoteAt > validateAt);
  assert.ok(convertAt > promoteAt);
  assert.match(worker, /FILE_WORKER_STORAGE_ORIGINS/);
  assert.match(worker, /timingSafeEqual/);
});

test("deployments reach the private scale-to-zero worker through the Flycast service port", () => {
  const privateWorkflow = read(".github/workflows/deploy-private-ross.yml");
  const publicWorkflow = read(".github/workflows/deploy-public-beta-ross.yml");
  const fly = read("deploy/fly/file-worker.toml");
  for (const workflow of [privateWorkflow, publicWorkflow]) {
    assert.match(workflow, /--flycast/);
    assert.match(workflow, /WORKER_URL="http:\/\/\$\{WORKER_APP\}\.flycast"/);
    assert.doesNotMatch(workflow, /\.flycast:3002/);
    assert.match(workflow, /ROSS_UPLOAD_SCAN_REQUIRED=true/);
    assert.match(workflow, /ROSS_SECURITY_ALERT_WEBHOOK_URL/);
  }
  assert.match(fly, /primary_region = "yyz"/);
  assert.match(fly, /auto_stop_machines = "stop"/);
  assert.match(fly, /min_machines_running = 0/);
  assert.match(fly, /hard_limit = 1/);
});

test("upload status is visible to the user", () => {
  const view = read("frontend/src/app/components/projects/ProjectDocumentsView.tsx");
  assert.match(view, /Scanning/);
  assert.match(view, /Blocked/);
  assert.match(view, /Scan failed/);
});

test("pending upload scans refresh automatically and announce terminal status", () => {
  const view = read("frontend/src/app/components/projects/ProjectDocumentsView.tsx");
  assert.match(view, /SCAN_STATUS_POLL_INTERVAL_MS = 3_000/);
  assert.match(view, /SCAN_STATUS_MAX_ATTEMPTS = 40/);
  assert.match(view, /SCAN_STATUS_MAX_FAILURES = 3/);
  assert.match(view, /const updated = await getProject\(projectId\)/);
  assert.match(view, /previous !== "pending"/);
  assert.match(view, /current === "clean"/);
  assert.match(view, /current === "infected"/);
  assert.match(view, /current === "failed"/);
  assert.match(view, /cancelled = true/);
  assert.match(view, /window\.clearTimeout\(timer\)/);
  assert.match(view, /aria-live="polite"/);
  assert.match(view, /role="status"/);
});

test("visible row action buttons have explicit accessible names", () => {
  const actions = read("frontend/src/app/components/shared/RowActions.tsx");
  const view = read("frontend/src/app/components/projects/ProjectDocumentsView.tsx");
  assert.match(actions, /aria-label=\{props\.ariaLabel \?\? "More actions"\}/);
  assert.match(actions, /aria-expanded=\{open\}/);
  assert.match(view, /ariaLabel=\{`Actions for \$\{docName\}`\}/);
});

test("CanLII keys use the encrypted per-user credential path", () => {
  const schema = read("backend/schema.sql");
  const keys = read("backend/src/lib/userApiKeys.ts");
  const page = read("frontend/src/app/(pages)/account/api-keys/page.tsx");
  const sources = read("backend/src/routes/legalSources.ts");
  assert.match(schema, /'canlii'/);
  assert.match(keys, /case "canlii"/);
  assert.match(page, /CanLII API Key/);
  assert.match(sources, /settings\.api_keys\.canlii/);
});
