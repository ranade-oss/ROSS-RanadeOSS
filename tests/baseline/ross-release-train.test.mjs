import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertReleaseTrainAppNames,
  extractDigestImageRef,
  nextPublicReleaseId,
  validateDigestImageRef,
} from "../../scripts/lib/release-train.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const image = (app, character) =>
  `registry.fly.io/${app}@sha256:${character.repeat(64)}`;

test("release IDs are generated from the Toronto date and never reused", () => {
  assert.equal(
    nextPublicReleaseId(
      [
        "ross-public-beta-20260726-rc1",
        "ross-public-beta-20260726-rc3",
        "ross-public-beta-20260725-rc9",
      ],
      new Date("2026-07-26T16:00:00.000Z"),
    ),
    "ross-public-beta-20260726-rc4",
  );
});

test("only immutable Fly digest references can enter the release ledger", () => {
  const expected = image("ross-ranadeoss-api", "a");
  assert.equal(validateDigestImageRef(expected), expected);
  assert.equal(
    extractDigestImageRef({
      Registry: "registry.fly.io",
      Repository: "ross-ranadeoss-api",
      Digest: `sha256:${"a".repeat(64)}`,
    }),
    expected,
  );
  assert.throws(
    () => validateDigestImageRef("registry.fly.io/ross-ranadeoss-api:latest"),
    /immutable/,
  );
});

test("production and rehearsal app names are fixed, distinct, and isolated", () => {
  const apps = {
    prodApi: "ross-ranadeoss-api",
    prodWeb: "ross-ranadeoss-public",
    prodWorker: "ross-ranadeoss-file-worker",
    stageApi: "ross-ranadeoss-api-rehearsal",
    stageWeb: "ross-ranadeoss-web-rehearsal",
    stageWorker: "ross-ranadeoss-worker-rehearsal",
  };
  assert.deepEqual(assertReleaseTrainAppNames(apps), apps);
  assert.throws(
    () =>
      assertReleaseTrainAppNames({
        ...apps,
        stageApi: apps.prodApi,
      }),
    /distinct/,
  );
});

test("the supported workflow is one-button rehearsal with optional public promotion", () => {
  const workflow = read(".github/workflows/verify-and-deploy-public-beta.yml");
  const fullGate = workflow.indexOf("name: Run complete engineering gate");
  const dockerGate = workflow.indexOf("name: Build every Fly container path");
  const build = workflow.indexOf("name: Build and pin candidate images once");
  const rehearsal = workflow.indexOf(
    "name: Run non-production promotion and rollback rehearsal",
  );
  const releasePreflight = workflow.indexOf(
    "name: Preflight the final release record without writing it",
  );
  const promotion = workflow.indexOf(
    "name: Promote the rehearsed digests to public production",
  );
  const tag = workflow.indexOf(
    "name: Create immutable tag and GitHub release after public success",
  );

  assert.match(workflow, /promote_public:[\s\S]*?default: false/);
  assert.doesNotMatch(
    workflow,
    /release_id:|fly_organization:|api_app_name:|web_app_name:|confirm_deployment:/,
  );
  assert.ok(fullGate < dockerGate);
  assert.ok(dockerGate < build);
  assert.ok(build < rehearsal);
  assert.ok(rehearsal < releasePreflight);
  assert.ok(releasePreflight < promotion);
  assert.ok(promotion < tag);
  assert.match(workflow, /if: inputs\.promote_public && success\(\)/);
  assert.match(workflow, /git push --dry-run origin/);
  assert.match(workflow, /fly-release-train\.mjs restore/);
  assert.match(workflow, /git tag -a "\$ROSS_RELEASE_ID"/);
  assert.match(workflow, /gh release create "\$ROSS_RELEASE_ID"/);
});

test("candidate images are built once, pushed, and converted to digest references", () => {
  const script = read("scripts/build-release-train-images.sh");
  assert.equal((script.match(/--build-only/g) ?? []).length, 3);
  assert.equal((script.match(/--push/g) ?? []).length, 3);
  assert.match(
    script,
    /release-train-image-ref\.mjs resolve "\$tag"/,
  );
  assert.match(script, /api_ref="\$\(resolve_image "\$api_tag"\)"/);
  assert.match(script, /CANDIDATE_API_IMAGE=/);
  assert.match(script, /NEXT_PUBLIC_REHEARSAL_API_BASE_URL/);
  assert.match(script, /ROSS_BUILD_RELEASE_ID/);
  assert.match(script, /FLY_BUILD_ATTEMPTS/);
  assert.match(script, /resolve_image/);
});

test("the frontend uses public runtime configuration for staging parity", () => {
  const layout = read("frontend/src/app/layout.tsx");
  const serverConfig = read(
    "frontend/src/app/lib/runtimeConfig.server.ts",
  );
  const clientConfig = read("frontend/src/app/lib/runtimeConfig.ts");
  const route = read("frontend/src/app/api/runtime-config/route.ts");
  const nextConfig = read("frontend/next.config.ts");

  assert.match(layout, /window\.__ROSS_RUNTIME_CONFIG__/);
  assert.match(serverConfig, /ROSS_RUNTIME_API_BASE_URL/);
  assert.match(serverConfig, /ROSS_RUNTIME_SIGNUPS_ENABLED/);
  assert.match(serverConfig, /ROSS_BUILD_RELEASE_ID/);
  assert.match(clientConfig, /getApiBaseUrl/);
  assert.match(clientConfig, /areSignupsEnabled/);
  assert.match(route, /Cache-Control": "no-store"/);
  assert.match(nextConfig, /NEXT_PUBLIC_REHEARSAL_API_BASE_URL/);

  const directApiUsers = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:ts|tsx)$/.test(entry.name)) {
        const relative = path.slice(root.length + 1);
        if (
          readFileSync(path, "utf8").includes(
            "process.env.NEXT_PUBLIC_API_BASE_URL",
          ) &&
          !relative.endsWith("runtimeConfig.ts") &&
          !relative.endsWith("runtimeConfig.server.ts")
        ) {
          directApiUsers.push(relative);
        }
      }
    }
  };
  walk(resolve(root, "frontend/src"));
  assert.deepEqual(directApiUsers, []);
});

test("rehearsal is private, read-only, and cannot dispatch production jobs", () => {
  const train = read("scripts/fly-release-train.mjs");
  const rehearsalApi = read("deploy/fly/rehearsal-api.toml");
  const rehearsalWeb = read("deploy/fly/rehearsal-frontend.toml");
  const dispatcher = read(
    "backend/src/lib/documentScanDispatcher.ts",
  );

  assert.match(train, /--no-public-ips/);
  assert.ok(train.includes('`http://${apiApp}.flycast`'));
  assert.ok(train.includes('`http://${webApp}.flycast`'));
  assert.ok(train.includes('`http://${workerApp}.flycast`'));
  assert.doesNotMatch(
    train.slice(
      train.indexOf("function smoke("),
      train.indexOf("function machineIds("),
    ),
    /\.internal/,
  );
  assert.match(train, /AbortSignal\.timeout\(10000\)/);
  assert.match(train, /after 12 attempts/);
  assert.match(rehearsalApi, /force_https = false/);
  assert.match(rehearsalWeb, /force_https = false/);
  assert.match(train, /ROSS_DISABLE_DOCUMENT_SCAN_DISPATCHER: "true"/);
  assert.match(train, /protectedUpload\.status === 401/);
  assert.match(train, /workerAuth\.status === 400/);
  assert.match(train, /observe-legal-sources\.mjs/);
  assert.match(train, /verifyProductionSecrets\(\)/);
  assert.doesNotMatch(
    train.slice(train.indexOf("function promote()")),
    /configureRehearsalCandidate\(\)/,
  );
  assert.match(
    dispatcher,
    /ROSS_DISABLE_DOCUMENT_SCAN_DISPATCHER !== "true"/,
  );
});

test("a fake Fly run proves forced failure, full rollback, and later promotion", () => {
  const temporary = mkdtempSync(join(tmpdir(), "ross-release-train-"));
  const bin = join(temporary, "bin");
  const statePath = join(temporary, "fly-state.json");
  const ledgerPath = join(temporary, "ledger.json");
  mkdirSync(bin);

  const apps = {
    prodApi: "ross-ranadeoss-api",
    prodWeb: "ross-ranadeoss-public",
    prodWorker: "ross-ranadeoss-file-worker",
    stageApi: "ross-ranadeoss-api-rehearsal",
    stageWeb: "ross-ranadeoss-web-rehearsal",
    stageWorker: "ross-ranadeoss-worker-rehearsal",
  };
  const baseline = {
    api: image(apps.prodApi, "a"),
    web: image(apps.prodWeb, "b"),
    worker: image(apps.prodWorker, "c"),
  };
  const candidate = {
    api: image(apps.prodApi, "d"),
    web: image(apps.prodWeb, "e"),
    worker: image(apps.prodWorker, "f"),
  };
  writeFileSync(
    statePath,
    JSON.stringify({
      candidateApi: candidate.api,
      apps: {
        [apps.prodApi]: { image: baseline.api, state: "started" },
        [apps.prodWeb]: { image: baseline.web, state: "started" },
        [apps.prodWorker]: {
          image: baseline.worker,
          state: "started",
        },
      },
    }),
  );

  const fakeFlyctl = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const statePath = process.env.FAKE_FLY_STATE;
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const command = args[0];
const subcommand = args[1];
if (command === "status") {
  process.exit(state.apps[flag("--app")] ? 0 : 1);
}
if (command === "apps" && subcommand === "create") {
  state.apps[args[2]] = { image: null, state: "stopped" };
  save();
  process.exit(0);
}
if (command === "secrets" && subcommand === "list") {
  const app = flag("--app");
  const productionNames = [
    "FILE_WORKER_SHARED_SECRET",
    "FILE_WORKER_STORAGE_ORIGINS",
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "R2_ENDPOINT_URL",
    "R2_REGION",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "FILE_WORKER_URL",
    "SECURITY_ALERT_WEBHOOK_URL",
    "SECURITY_ALERT_WEBHOOK_SECRET",
    "DOWNLOAD_SIGNING_SECRET",
    "USER_API_KEYS_ENCRYPTION_SECRET",
    "MCP_CONNECTORS_ENCRYPTION_SECRET",
  ];
  process.stdout.write(JSON.stringify(
    app.includes("-rehearsal")
      ? []
      : productionNames.map((Name) => ({ Name })),
  ));
  process.exit(0);
}
if (command === "secrets" && subcommand === "set") process.exit(0);
if (command === "secrets" && subcommand === "unset") process.exit(0);
if (command === "deploy") {
  const app = flag("--app");
  const image = flag("--image");
  const config = flag("--config") || "";
  if (
    state.failOnceApp === app &&
    state.failOnceImage === image
  ) {
    delete state.failOnceApp;
    delete state.failOnceImage;
    save();
    process.exit(1);
  }
  if (
    app.endsWith("web-rehearsal") &&
    image === state.candidateApi &&
    config.includes("rehearsal-frontend")
  ) {
    process.exit(1);
  }
  state.apps[app] = { image, state: "started" };
  save();
  process.exit(0);
}
if (command === "image" && subcommand === "show") {
  const current = state.apps[flag("--app")]?.image;
  if (!current) process.exit(1);
  const withoutRegistry = current.replace("registry.fly.io/", "");
  const [repository, digest] = withoutRegistry.split("@");
  process.stdout.write(JSON.stringify({
    Registry: "registry.fly.io",
    Repository: repository,
    Digest: digest,
  }));
  process.exit(0);
}
if (command === "ssh" && subcommand === "console") {
  const probe = flag("--command") || "";
  const encodedProbe = probe.match(
    /Buffer\\.from\\('([^']+)','base64'\\)/,
  )?.[1];
  if (!encodedProbe) {
    process.stderr.write("The deployed probe payload is missing.");
    process.exit(30);
  }
  try {
    new Function(Buffer.from(encodedProbe, "base64").toString("utf8"));
  } catch (error) {
    process.stderr.write("The deployed probe payload is invalid: " + error.message);
    process.exit(30);
  }
  if (probe.includes(".internal")) {
    process.stderr.write("Direct 6PN probes are forbidden for IPv4-bound services.");
    process.exit(31);
  }
  const rehearsal =
    probe.includes("http://ross-ranadeoss-api-rehearsal.flycast") &&
    probe.includes("http://ross-ranadeoss-web-rehearsal.flycast") &&
    probe.includes("http://ross-ranadeoss-worker-rehearsal.flycast");
  const production =
    probe.includes("https://ross-ranadeoss-api.fly.dev") &&
    probe.includes("https://ross-ranadeoss-public.fly.dev") &&
    probe.includes("http://ross-ranadeoss-file-worker.flycast");
  if (!rehearsal && !production) {
    process.stderr.write("Probe did not use the required Fly Proxy routes.");
    process.exit(32);
  }
  state.probes = [...(state.probes || []), probe];
  save();
  process.exit(0);
}
if (command === "machine" && subcommand === "list") {
  const app = flag("--app");
  const record = state.apps[app];
  process.stdout.write(record?.image ? JSON.stringify([{
    id: app + "-machine",
    state: record.state,
  }]) : "[]");
  process.exit(0);
}
if (command === "machine" && subcommand === "stop") {
  const app = flag("--app");
  if (state.apps[app]) state.apps[app].state = "stopped";
  save();
  process.exit(0);
}
process.stderr.write("Unexpected fake flyctl command: " + args.join(" "));
process.exit(2);
`;
  const fakeCurl = `#!/usr/bin/env node
const args = process.argv.slice(2);
const url = args[args.length - 1] || "";
if (url.endsWith("/api/runtime-config")) {
  const origin = new URL(url).origin;
  const rehearsal = origin.includes("web-rehearsal");
  const apiOrigin = rehearsal
    ? origin.replace("web-rehearsal", "api-rehearsal")
    : "https://" + process.env.PROD_API_APP + ".fly.dev";
  process.stdout.write(JSON.stringify({
    apiBaseUrl: apiOrigin,
    appUrl: origin,
    releaseId: rehearsal ? "rehearsal" : process.env.ROSS_RELEASE_ID,
    signupsEnabled: !rehearsal,
    environment: rehearsal ? "rehearsal" : "public-beta",
  }));
}
`;
  const fakeNode = `#!/usr/bin/env bash
if [ "\${1:-}" = "scripts/observe-legal-sources.mjs" ]; then
  exit 0
fi
exec ${process.execPath} "$@"
`;
  writeFileSync(join(bin, "flyctl"), fakeFlyctl);
  writeFileSync(join(bin, "curl"), fakeCurl);
  writeFileSync(join(bin, "node"), fakeNode);
  chmodSync(join(bin, "flyctl"), 0o755);
  chmodSync(join(bin, "curl"), 0o755);
  chmodSync(join(bin, "node"), 0o755);

  const environment = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    FAKE_FLY_STATE: statePath,
    ROSS_RELEASE_LEDGER_PATH: ledgerPath,
    FLY_API_TOKEN: "synthetic-fly-token",
    FLY_ORG: "personal",
    PROD_API_APP: apps.prodApi,
    PROD_WEB_APP: apps.prodWeb,
    PROD_WORKER_APP: apps.prodWorker,
    STAGE_API_APP: apps.stageApi,
    STAGE_WEB_APP: apps.stageWeb,
    STAGE_WORKER_APP: apps.stageWorker,
    CANDIDATE_API_IMAGE: candidate.api,
    CANDIDATE_WEB_IMAGE: candidate.web,
    CANDIDATE_WORKER_IMAGE: candidate.worker,
    ROSS_RELEASE_ID: "ross-public-beta-20260726-rc9",
    ROSS_SUPABASE_URL: "https://synthetic.supabase.co",
    ROSS_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-key",
    ROSS_SUPABASE_SECRET_KEY: "synthetic-secret-key",
    ROSS_S3_ENDPOINT_URL: "https://synthetic-storage.test",
    ROSS_S3_REGION: "auto",
    ROSS_S3_ACCESS_KEY_ID: "synthetic-access",
    ROSS_S3_SECRET_ACCESS_KEY: "synthetic-storage-secret",
    ROSS_SECURITY_ALERT_WEBHOOK_URL:
      "https://synthetic-alerts.test/ingest",
    ROSS_SECURITY_ALERT_WEBHOOK_SECRET: "synthetic-alert-secret",
    GITHUB_SHA: "1".repeat(40),
    GITHUB_RUN_ID: "12345",
    GITHUB_RUN_ATTEMPT: "1",
    ROSS_QUALIFICATION_STATUS: "passed",
    FLY_DEPLOY_ATTEMPTS: "1",
  };
  const runTrain = (mode) =>
    spawnSync(
      process.execPath,
      [resolve(root, "scripts/fly-release-train.mjs"), mode],
      { env: environment, encoding: "utf8" },
    );

  const rehearsal = runTrain("rehearse");
  assert.equal(rehearsal.status, 0, rehearsal.stderr || rehearsal.stdout);
  let ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  let state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(ledger.rehearsal.status, "passed");
  assert.equal(ledger.rehearsal.expectedFailureObserved, true);
  assert.equal(ledger.rehearsal.rollbackVerified, true);
  assert.equal(ledger.rehearsal.candidatePromotionVerified, true);
  assert.equal(state.apps[apps.stageApi].image, candidate.api);
  assert.equal(state.apps[apps.stageWeb].image, candidate.web);
  assert.equal(state.apps[apps.stageWorker].image, candidate.worker);
  assert.equal(state.apps[apps.stageApi].state, "stopped");
  assert.equal(state.apps[apps.stageWeb].state, "stopped");
  assert.equal(state.apps[apps.stageWorker].state, "stopped");
  assert.equal(state.apps[apps.prodApi].image, baseline.api);
  assert.equal(state.apps[apps.prodWeb].image, baseline.web);
  assert.equal(state.apps[apps.prodWorker].image, baseline.worker);
  assert.ok(
    state.probes.some((probe) =>
      probe.includes("http://ross-ranadeoss-api-rehearsal.flycast"),
    ),
  );
  assert.equal(
    state.probes.some((probe) => probe.includes(".internal")),
    false,
  );

  state.failOnceApp = apps.prodWeb;
  state.failOnceImage = candidate.web;
  writeFileSync(statePath, JSON.stringify(state));
  const failedPromotion = runTrain("promote");
  assert.notEqual(failedPromotion.status, 0);
  ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(ledger.production.status, "rolled-back");
  assert.equal(ledger.production.baselineHealthVerified, true);
  assert.equal(ledger.production.rollbackAttempted, true);
  assert.equal(ledger.production.rollbackVerified, true);
  assert.equal(state.apps[apps.prodApi].image, baseline.api);
  assert.equal(state.apps[apps.prodWeb].image, baseline.web);
  assert.equal(state.apps[apps.prodWorker].image, baseline.worker);

  const successfulPromotion = runTrain("promote");
  assert.equal(
    successfulPromotion.status,
    0,
    successfulPromotion.stderr || successfulPromotion.stdout,
  );
  ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(ledger.production.status, "passed");
  assert.equal(state.apps[apps.prodApi].image, candidate.api);
  assert.equal(state.apps[apps.prodWeb].image, candidate.web);
  assert.equal(state.apps[apps.prodWorker].image, candidate.worker);
  assert.ok(
    state.probes.some((probe) =>
      probe.includes("https://ross-ranadeoss-api.fly.dev"),
    ),
  );

  const restoredPromotion = runTrain("restore");
  assert.equal(
    restoredPromotion.status,
    0,
    restoredPromotion.stderr || restoredPromotion.stdout,
  );
  ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(ledger.production.status, "rolled-back");
  assert.equal(ledger.production.rollbackVerified, true);
  assert.equal(state.apps[apps.prodApi].image, baseline.api);
  assert.equal(state.apps[apps.prodWeb].image, baseline.web);
  assert.equal(state.apps[apps.prodWorker].image, baseline.worker);
});
