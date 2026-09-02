#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { deployedReleaseTrainProbe } from "./lib/release-train-probe.mjs";
import {
    assertReleaseTrainAppNames,
    extractDigestImageRef,
    validateDigestImageRef,
} from "./lib/release-train.mjs";

const root = resolve(import.meta.dirname, "..");
const ledgerPath = resolve(
    root,
    process.env.ROSS_RELEASE_LEDGER_PATH ??
        "artifacts/release-train-ledger.json",
);
const command = process.argv[2];
if (
    command !== "rehearse" &&
    command !== "promote" &&
    command !== "restore"
) {
    throw new Error(
        "Usage: fly-release-train.mjs rehearse | promote | restore",
    );
}

function required(name) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Required release-train value is missing: ${name}`);
    return value;
}

const apps = assertReleaseTrainAppNames({
    prodApi: required("PROD_API_APP"),
    prodWeb: required("PROD_WEB_APP"),
    prodWorker: required("PROD_WORKER_APP"),
    stageApi: required("STAGE_API_APP"),
    stageWeb: required("STAGE_WEB_APP"),
    stageWorker: required("STAGE_WORKER_APP"),
});
const candidate = {
    api: validateDigestImageRef(required("CANDIDATE_API_IMAGE"), "candidate API image"),
    web: validateDigestImageRef(required("CANDIDATE_WEB_IMAGE"), "candidate web image"),
    worker: validateDigestImageRef(
        required("CANDIDATE_WORKER_IMAGE"),
        "candidate worker image",
    ),
};
const flyOrg = required("FLY_ORG");
const releaseId = required("ROSS_RELEASE_ID");
const policyVersion =
    process.env.POLICY_VERSION?.trim() || "2026-07-17-public-beta";
const commandTimeoutMs = Number(
    process.env.ROSS_RELEASE_COMMAND_TIMEOUT_MS ?? "300000",
);
if (
    !Number.isInteger(commandTimeoutMs) ||
    commandTimeoutMs < 1000 ||
    commandTimeoutMs > 600000
) {
    throw new Error(
        "ROSS_RELEASE_COMMAND_TIMEOUT_MS must be an integer from 1000 through 600000.",
    );
}

function run(executable, args, options = {}) {
    const capture = options.capture === true;
    const result = spawnSync(executable, args, {
        cwd: root,
        encoding: "utf8",
        input: options.input,
        env: process.env,
        timeout: options.timeoutMs ?? commandTimeoutMs,
        stdio: capture ? ["pipe", "pipe", "pipe"] : "inherit",
    });
    if (result.error) throw result.error;
    if (!options.allowFailure && result.status !== 0) {
        const detail = capture
            ? (result.stderr || result.stdout || "").trim().slice(-1000)
            : "";
        throw new Error(
            `${executable} exited with status ${result.status}${detail ? `: ${detail}` : ""}`,
        );
    }
    return result;
}

function loadLedger() {
    if (!existsSync(ledgerPath)) {
        return {
            schemaVersion: 1,
            run: {
                commit: process.env.GITHUB_SHA?.trim() || "local",
                runId: process.env.GITHUB_RUN_ID?.trim() || "local",
                runAttempt:
                    process.env.GITHUB_RUN_ATTEMPT?.trim() || "1",
                releaseId,
            },
            apps,
            images: { candidate },
            qualification: {
                status:
                    process.env.ROSS_QUALIFICATION_STATUS?.trim() ||
                    "unknown",
            },
        };
    }
    return JSON.parse(readFileSync(ledgerPath, "utf8"));
}

const ledger = loadLedger();

function saveLedger() {
    mkdirSync(resolve(ledgerPath, ".."), { recursive: true });
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

function now() {
    return new Date().toISOString();
}

class ExpectedRehearsalFailure extends Error {
    constructor(message) {
        super(message);
        this.name = "ExpectedRehearsalFailure";
    }
}

function currentImage(app) {
    const result = run(
        "flyctl",
        ["image", "show", "--app", app, "--json"],
        { capture: true },
    );
    return extractDigestImageRef(
        JSON.parse(result.stdout),
        `${app} current image`,
    );
}

function verifyImage(app, expected) {
    const actual = currentImage(app);
    if (actual !== expected) {
        throw new Error(`${app} runs ${actual}, expected ${expected}.`);
    }
}

function ensureApp(app) {
    const status = run("flyctl", ["status", "--app", app], {
        capture: true,
        allowFailure: true,
    });
    if (status.status === 0) return;
    run("flyctl", [
        "apps",
        "create",
        app,
        "--org",
        flyOrg,
        "--yes",
    ]);
}

function setStagedSecrets(app, entries) {
    const pairs = Object.entries(entries).map(([name, value]) => {
        if (typeof value !== "string" || !value) {
            throw new Error(`Cannot configure empty Fly secret ${name}.`);
        }
        return `${name}=${value}`;
    });
    run("flyctl", ["secrets", "set", "--stage", "--app", app, ...pairs]);
}

function unsetStagedSecrets(app, names) {
    const configured = configuredSecretNames(app);
    const present = names.filter((name) => configured.has(name));
    if (present.length) {
        run("flyctl", [
            "secrets",
            "unset",
            "--stage",
            "--app",
            app,
            ...present,
        ]);
    }
}

function configuredSecretNames(app) {
    const result = run(
        "flyctl",
        ["secrets", "list", "--app", app, "--json"],
        { capture: true },
    );
    const payload = JSON.parse(result.stdout);
    const names = new Set();
    const walk = (value) => {
        if (Array.isArray(value)) {
            value.forEach(walk);
        } else if (value && typeof value === "object") {
            const name = value.Name ?? value.name;
            if (typeof name === "string") names.add(name);
            Object.values(value).forEach(walk);
        }
    };
    walk(payload);
    return names;
}

function ensureLongLivedApiSecrets(app) {
    const configured = configuredSecretNames(app);
    const missing = {};
    for (const name of [
        "DOWNLOAD_SIGNING_SECRET",
        "USER_API_KEYS_ENCRYPTION_SECRET",
        "MCP_CONNECTORS_ENCRYPTION_SECRET",
    ]) {
        if (!configured.has(name)) missing[name] = randomBytes(32).toString("hex");
    }
    if (Object.keys(missing).length) setStagedSecrets(app, missing);
}

function requireConfiguredSecrets(app, names) {
    const configured = configuredSecretNames(app);
    const missing = names.filter((name) => !configured.has(name));
    if (missing.length) {
        throw new Error(
            `${app} is missing existing production secrets: ${missing.join(", ")}.`,
        );
    }
}

function verifyProductionSecrets() {
    requireConfiguredSecrets(apps.prodWorker, [
        "FILE_WORKER_SHARED_SECRET",
        "FILE_WORKER_STORAGE_ORIGINS",
    ]);
    requireConfiguredSecrets(apps.prodApi, [
        "SUPABASE_URL",
        "SUPABASE_SECRET_KEY",
        "R2_ENDPOINT_URL",
        "R2_REGION",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "FILE_WORKER_URL",
        "FILE_WORKER_SHARED_SECRET",
        "SECURITY_ALERT_WEBHOOK_URL",
        "SECURITY_ALERT_WEBHOOK_SECRET",
        "DOWNLOAD_SIGNING_SECRET",
        "USER_API_KEYS_ENCRYPTION_SECRET",
        "MCP_CONNECTORS_ENCRYPTION_SECRET",
    ]);
}

function configureRehearsalBaseline() {
    const appUrl = `https://${apps.stageWeb}.fly.dev`;
    const apiUrl = `https://${apps.stageApi}.fly.dev`;

    unsetStagedSecrets(apps.stageApi, [
        "FILE_WORKER_URL",
        "FILE_WORKER_SHARED_SECRET",
        "ROSS_RELEASE_ID",
    ]);
    setStagedSecrets(apps.stageWorker, {
        FILE_WORKER_STORAGE_ORIGINS: required("ROSS_S3_ENDPOINT_URL"),
    });
    setStagedSecrets(apps.stageApi, {
        SUPABASE_URL: required("ROSS_SUPABASE_URL"),
        SUPABASE_SECRET_KEY: required("ROSS_SUPABASE_SECRET_KEY"),
        R2_ENDPOINT_URL: required("ROSS_S3_ENDPOINT_URL"),
        R2_REGION: required("ROSS_S3_REGION"),
        R2_ACCESS_KEY_ID: required("ROSS_S3_ACCESS_KEY_ID"),
        R2_SECRET_ACCESS_KEY: required("ROSS_S3_SECRET_ACCESS_KEY"),
        R2_BUCKET_NAME: "ross-private-files",
        ROSS_UPLOAD_SCAN_REQUIRED: "false",
        ROSS_DISABLE_DOCUMENT_SCAN_DISPATCHER: "true",
        ROSS_ENV: "staging",
        ROSS_HOSTED_MODE: "controlled-beta",
        ROSS_REQUIRE_VERIFIED_EMAIL: "true",
        HOSTED_MODEL_PROVIDERS: "openai",
        ROSS_DATA_BOUNDARY_VERSION: policyVersion,
        ROSS_RUNTIME_RELEASE_ID: `rehearsal-${process.env.GITHUB_RUN_ID ?? "local"}`,
        RATE_LIMIT_GENERAL_MAX: "180",
        RATE_LIMIT_CHAT_MAX: "20",
        RATE_LIMIT_UPLOAD_MAX: "20",
        RATE_LIMIT_EXPORT_MAX: "5",
        DOWNLOAD_TOKEN_TTL_SECONDS: "86400",
        CORS_ALLOWED_ORIGINS: appUrl,
        FRONTEND_URL: appUrl,
        API_PUBLIC_URL: apiUrl,
    });
    ensureLongLivedApiSecrets(apps.stageApi);
    setStagedSecrets(apps.stageWeb, {
        ROSS_RUNTIME_API_BASE_URL: apiUrl,
        ROSS_RUNTIME_APP_URL: appUrl,
        ROSS_RUNTIME_SIGNUPS_ENABLED: "false",
        ROSS_RUNTIME_ENVIRONMENT: "rehearsal",
        ROSS_RUNTIME_RELEASE_ID: `rehearsal-${process.env.GITHUB_RUN_ID ?? "local"}`,
    });
}

function configureRehearsalCandidate() {
    const workerSecret = randomBytes(32).toString("hex");
    setStagedSecrets(apps.stageWorker, {
        FILE_WORKER_SHARED_SECRET: workerSecret,
        FILE_WORKER_STORAGE_ORIGINS: required("ROSS_S3_ENDPOINT_URL"),
    });
    setStagedSecrets(apps.stageApi, {
        FILE_WORKER_URL: `http://${apps.stageWorker}.flycast`,
        FILE_WORKER_SHARED_SECRET: workerSecret,
        SECURITY_ALERT_WEBHOOK_URL: required(
            "ROSS_SECURITY_ALERT_WEBHOOK_URL",
        ),
        SECURITY_ALERT_WEBHOOK_SECRET: required(
            "ROSS_SECURITY_ALERT_WEBHOOK_SECRET",
        ),
        ROSS_UPLOAD_SCAN_REQUIRED: "true",
        ROSS_DISABLE_DOCUMENT_SCAN_DISPATCHER: "true",
    });
}

const productionConfig = {
    api: "deploy/fly/api.toml",
    web: "deploy/fly/frontend.toml",
    worker: "deploy/fly/file-worker.toml",
};
const rehearsalConfig = {
    api: "deploy/fly/rehearsal-api.toml",
    web: "deploy/fly/rehearsal-frontend.toml",
    worker: "deploy/fly/rehearsal-file-worker.toml",
};

function deployImage(
    app,
    config,
    image,
    { worker = false, privateOnly = false } = {},
) {
    const args = [
        "deploy",
        ".",
        "--config",
        config,
        "--app",
        app,
        "--image",
        image,
        "--ha=false",
        "--yes",
    ];
    if (worker || privateOnly) args.push("--flycast");
    if (privateOnly) args.push("--no-public-ips");
    return run("bash", [
        "scripts/fly-deploy-with-retry.sh",
        ".",
        ...args.slice(2),
    ]);
}

function deploySet(targetApps, config, images, { privateOnly = false } = {}) {
    deployImage(targetApps.worker, config.worker, images.worker, {
        worker: true,
        privateOnly,
    });
    deployImage(targetApps.api, config.api, images.api, { privateOnly });
    deployImage(targetApps.web, config.web, images.web, { privateOnly });
}

function verifySet(targetApps, images) {
    verifyImage(targetApps.worker, images.worker);
    verifyImage(targetApps.api, images.api);
    verifyImage(targetApps.web, images.web);
}

function verifyRehearsalSet(images, { full = false } = {}) {
    smoke("rehearsal", { full });
    verifySet(
        {
            worker: apps.stageWorker,
            api: apps.stageApi,
            web: apps.stageWeb,
        },
        images,
    );
}

function runRemoteProbe(app, machineId, args) {
    const encoded = Buffer.from(deployedReleaseTrainProbe).toString("base64");
    const command = [
        `node -e "eval(Buffer.from('${encoded}','base64').toString())"`,
        ...args.map((value) => JSON.stringify(value)),
    ].join(" ");
    let last = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        last = run(
            "flyctl",
            [
                "ssh",
                "console",
                "--app",
                app,
                "--machine",
                machineId,
                "--command",
                command,
            ],
            { allowFailure: true, capture: true },
        );
        if (last.status === 0) return;
        const detail = (last.stderr || last.stdout || "").trim();
        if (detail) process.stderr.write(`${detail}\n`);
        if (attempt < 3) run("sleep", ["5"]);
    }
    const detail = (last?.stderr || last?.stdout || "").trim().slice(-1000);
    throw new Error(
        `Deployed service probe failed for ${app} Machine ${machineId} with status ${last?.status}${detail ? `: ${detail}` : ""}.`,
    );
}

function observeLegalSources(outputPath) {
    const resolvedOutputPath = resolve(root, outputPath);
    if (existsSync(resolvedOutputPath)) unlinkSync(resolvedOutputPath);

    const result = run(
        "node",
        [
            "scripts/observe-legal-sources.mjs",
            "--output",
            outputPath,
        ],
        { capture: true, allowFailure: true },
    );
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (!existsSync(resolvedOutputPath)) {
        throw new Error(
            `Live legal-source observer did not produce a sanitized report at ${outputPath}.`,
        );
    }

    let report;
    try {
        report = JSON.parse(readFileSync(resolvedOutputPath, "utf8"));
    } catch (error) {
        throw new Error(
            `Live legal-source observer produced an unreadable sanitized report: ${error instanceof Error ? error.message : String(error)}.`,
        );
    }

    const providerStates = Object.fromEntries(
        Object.entries(report.providers ?? {}).map(([id, item]) => [
            id,
            {
                state: item?.state ?? "unknown",
                reasonCode: item?.reasonCode ?? "unknown",
                attempts: item?.attempts ?? null,
            },
        ]),
    );
    ledger.rehearsal.legalSourceObservation = report.status ?? "unknown";
    ledger.rehearsal.legalSourceProviders = providerStates;
    ledger.rehearsal.legalSourceObserverExitCode = result.status;
    saveLedger();

    if (result.status !== 0 || report.status !== "healthy") {
        const summary = Object.entries(providerStates)
            .map(
                ([id, item]) =>
                    `${id}=${item.state} (${item.reasonCode}, attempts=${item.attempts ?? "unknown"})`,
            )
            .join(", ");
        throw new Error(
            `Live legal-source observation ${report.status ?? "unknown"}; provider states: ${summary}.`,
        );
    }
    return report;
}

function wakePublicService(url) {
    run("curl", [
        "--fail",
        "--silent",
        "--show-error",
        "--retry",
        "8",
        "--retry-delay",
        "5",
        "--retry-all-errors",
        "--output",
        "/dev/null",
        url,
    ]);
}

function smoke(target, { full = false } = {}) {
    const apiApp = target === "rehearsal" ? apps.stageApi : apps.prodApi;
    const webApp = target === "rehearsal" ? apps.stageWeb : apps.prodWeb;
    const workerApp =
        target === "rehearsal" ? apps.stageWorker : apps.prodWorker;
    const publicApi = `https://${apiApp}.fly.dev`;
    const publicWeb = `https://${webApp}.fly.dev`;
    const apiNetwork =
        target === "rehearsal"
            ? `http://${apiApp}.flycast`
            : publicApi;
    const webNetwork =
        target === "rehearsal"
            ? `http://${webApp}.flycast`
            : publicWeb;
    let probeMachine;
    if (target === "rehearsal") {
        const started = startRehearsalMachines({
            worker: workerApp,
            web: webApp,
            api: apiApp,
        });
        probeMachine = started.api;
    } else {
        wakePublicService(`${publicApi}/health`);
        wakePublicService(`${publicWeb}/login`);
        probeMachine = requireStartedMachine(apiApp);
    }
    runRemoteProbe(apiApp, probeMachine, [
        apiNetwork,
        webNetwork,
        `http://${workerApp}.flycast`,
        publicApi,
        publicWeb,
        target,
        target === "rehearsal"
            ? `rehearsal-${process.env.GITHUB_RUN_ID ?? "local"}`
            : releaseId,
        target === "public-beta" ? "true" : "false",
        full ? "true" : "false",
    ]);
}

function machineIds(app, { allowFailure = false } = {}) {
    let lastDetail = "";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const result = run(
            "flyctl",
            ["machine", "list", "--app", app, "--json"],
            { capture: true, allowFailure: true },
        );
        if (result.status === 0) {
            try {
                const payload = JSON.parse(result.stdout);
                if (Array.isArray(payload)) {
                    return payload
                        .map((machine) => ({
                            id: machine?.id ?? machine?.ID,
                            state: machine?.state ?? machine?.State,
                        }))
                        .filter(
                            (machine) => typeof machine.id === "string",
                        );
                }
                lastDetail = "Fly returned a non-array Machine list.";
            } catch (error) {
                lastDetail =
                    error instanceof Error ? error.message : String(error);
            }
        } else {
            lastDetail = (result.stderr || result.stdout || "").trim();
        }
        if (attempt < 3) run("sleep", ["5"]);
    }
    if (allowFailure) return [];
    throw new Error(
        `Could not list Machines for ${app} after 3 attempts${lastDetail ? `: ${lastDetail.slice(-1000)}` : ""}.`,
    );
}

function requireStartedMachine(app) {
    const machines = machineIds(app);
    const started = machines.find((machine) => machine.state === "started");
    if (started) return started.id;
    const states = machines.length
        ? machines
              .map((machine) => `${machine.id}:${machine.state ?? "unknown"}`)
              .join(", ")
        : "none";
    throw new Error(`${app} has no started Machine; observed ${states}.`);
}

function startAppMachines(app) {
    let machines = [];
    for (let attempt = 1; attempt <= 6; attempt += 1) {
        machines = machineIds(app);
        if (machines.length) break;
        if (attempt < 6) run("sleep", ["5"]);
    }
    if (!machines.length) {
        throw new Error(
            `${app} has no Machine to start after 6 post-deployment checks.`,
        );
    }
    for (const machine of machines) {
        let lastDetail = "";
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            const current = machineIds(app).find(
                (item) => item.id === machine.id,
            );
            if (current?.state !== "started") {
                const start = run(
                    "flyctl",
                    ["machine", "start", machine.id, "--app", app],
                    { allowFailure: true, capture: true },
                );
                lastDetail = (start.stderr || start.stdout || "").trim();
            }
            const wait = run(
                "flyctl",
                [
                    "machine",
                    "wait",
                    machine.id,
                    "--app",
                    app,
                    "--state",
                    "started",
                    "--wait-timeout",
                    "2m",
                ],
                { allowFailure: true, capture: true },
            );
            if (wait.status === 0) {
                const confirmed = machineIds(app).find(
                    (item) => item.id === machine.id,
                );
                if (confirmed?.state === "started") break;
            }
            lastDetail =
                (wait.stderr || wait.stdout || "").trim() || lastDetail;
            if (attempt < 3) run("sleep", ["5"]);
            else {
                throw new Error(
                    `${app} Machine ${machine.id} did not reach and remain in started state after 3 attempts${lastDetail ? `: ${lastDetail.slice(-1000)}` : ""}.`,
                );
            }
        }
    }
    return requireStartedMachine(app);
}

function startRehearsalMachines(targetApps) {
    return {
        worker: startAppMachines(targetApps.worker),
        web: startAppMachines(targetApps.web),
        api: startAppMachines(targetApps.api),
    };
}

function stopRehearsalMachines() {
    for (const app of [apps.stageWorker, apps.stageApi, apps.stageWeb]) {
        for (const machine of machineIds(app, { allowFailure: true })) {
            if (machine.state === "stopped") continue;
            run(
                "flyctl",
                ["machine", "stop", machine.id, "--app", app],
                { allowFailure: true },
            );
        }
    }
}

function baselineProductionImages() {
    return {
        worker: currentImage(apps.prodWorker),
        api: currentImage(apps.prodApi),
        web: currentImage(apps.prodWeb),
    };
}

function rehearse() {
    ledger.rehearsal = {
        status: "running",
        startedAt: now(),
        expectedFailureObserved: false,
        failureInjection: {
            type: "controlled-partial-promotion",
            status: "pending",
        },
        rollbackVerified: false,
        candidatePromotionVerified: false,
    };
    saveLedger();

    try {
        for (const app of [apps.stageWorker, apps.stageApi, apps.stageWeb]) {
            ensureApp(app);
        }
        const baseline = baselineProductionImages();
        ledger.images.productionBaseline = baseline;
        configureRehearsalBaseline();

        const stageApps = {
            worker: apps.stageWorker,
            api: apps.stageApi,
            web: apps.stageWeb,
        };
        deploySet(stageApps, rehearsalConfig, baseline, {
            privateOnly: true,
        });
        verifyRehearsalSet(baseline);

        let forcedFailureError = null;
        try {
            deployImage(
                stageApps.worker,
                rehearsalConfig.worker,
                candidate.worker,
                { worker: true, privateOnly: true },
            );
            deployImage(
                stageApps.api,
                rehearsalConfig.api,
                candidate.api,
                { privateOnly: true },
            );
            verifyImage(stageApps.worker, candidate.worker);
            verifyImage(stageApps.api, candidate.api);
            verifyImage(stageApps.web, baseline.web);
            ledger.rehearsal.failureInjection = {
                type: "controlled-partial-promotion",
                status: "observed",
                observedAt: now(),
                workerImage: candidate.worker,
                apiImage: candidate.api,
                webImage: baseline.web,
            };
            ledger.rehearsal.expectedFailureObserved = true;
            saveLedger();
            throw new ExpectedRehearsalFailure(
                "Controlled rehearsal fault after verified worker/API promotion.",
            );
        } catch (error) {
            if (!(error instanceof ExpectedRehearsalFailure)) {
                forcedFailureError = error;
            }
        } finally {
            configureRehearsalBaseline();
            deploySet(stageApps, rehearsalConfig, baseline, {
                privateOnly: true,
            });
            verifyRehearsalSet(baseline);
            ledger.rehearsal.rollbackVerified = true;
            saveLedger();
        }
        if (forcedFailureError) throw forcedFailureError;
        if (!ledger.rehearsal.expectedFailureObserved) {
            throw new Error("The expected staging failure was not observed.");
        }

        configureRehearsalCandidate();
        try {
            deploySet(stageApps, rehearsalConfig, candidate, {
                privateOnly: true,
            });
            verifyRehearsalSet(candidate, { full: true });
            observeLegalSources(
                "artifacts/release-train-legal-source-health.json",
            );
            ledger.rehearsal.candidatePromotionVerified = true;
            ledger.rehearsal.readOnlyIntegrationChecks = "passed";
        } catch (error) {
            ledger.rehearsal.candidateFailureRollbackAttempted = true;
            try {
                configureRehearsalBaseline();
                deploySet(stageApps, rehearsalConfig, baseline, {
                    privateOnly: true,
                });
                verifyRehearsalSet(baseline);
                ledger.rehearsal.candidateFailureRollbackVerified = true;
            } catch (rollbackError) {
                ledger.rehearsal.candidateFailureRollbackVerified = false;
                ledger.rehearsal.candidateFailureRollbackError =
                    rollbackError instanceof Error
                        ? rollbackError.message
                        : String(rollbackError);
            }
            throw error;
        }
        ledger.rehearsal.status = "passed";
        ledger.rehearsal.completedAt = now();
    } catch (error) {
        ledger.rehearsal.status = "failed";
        ledger.rehearsal.error =
            error instanceof Error ? error.message : String(error);
        ledger.rehearsal.completedAt = now();
        throw error;
    } finally {
        stopRehearsalMachines();
        saveLedger();
    }
}

function promote() {
    if (
        ledger.rehearsal?.status !== "passed" ||
        ledger.rehearsal?.rollbackVerified !== true ||
        ledger.rehearsal?.candidatePromotionVerified !== true
    ) {
        throw new Error(
            "Production promotion requires a passing rehearsal in this run.",
        );
    }
    const prodApps = {
        worker: apps.prodWorker,
        api: apps.prodApi,
        web: apps.prodWeb,
    };
    verifyProductionSecrets();
    const baseline = baselineProductionImages();
    ledger.images.productionBaseline = baseline;
    smoke("public-beta");
    ledger.production = {
        status: "running",
        startedAt: now(),
        baselineHealthVerified: true,
        rollbackAttempted: false,
        rollbackVerified: false,
    };
    saveLedger();

    try {
        deploySet(prodApps, productionConfig, candidate);
        verifySet(prodApps, candidate);
        smoke("public-beta", { full: true });
        ledger.production.status = "passed";
        ledger.production.completedAt = now();
    } catch (error) {
        ledger.production.rollbackAttempted = true;
        try {
            deploySet(prodApps, productionConfig, baseline);
            verifySet(prodApps, baseline);
            smoke("public-beta");
            ledger.production.rollbackVerified = true;
            ledger.production.status = "rolled-back";
        } catch (rollbackError) {
            ledger.production.status = "rollback-failed";
            ledger.production.rollbackError =
                rollbackError instanceof Error
                    ? rollbackError.message
                    : String(rollbackError);
        }
        ledger.production.error =
            error instanceof Error ? error.message : String(error);
        ledger.production.completedAt = now();
        throw error;
    } finally {
        saveLedger();
    }
}

function restoreProductionBaseline() {
    const baseline = ledger.images?.productionBaseline;
    if (!baseline) {
        throw new Error("The release ledger has no production baseline.");
    }
    const validatedBaseline = {
        api: validateDigestImageRef(baseline.api, "baseline API image"),
        web: validateDigestImageRef(baseline.web, "baseline web image"),
        worker: validateDigestImageRef(
            baseline.worker,
            "baseline worker image",
        ),
    };
    const prodApps = {
        worker: apps.prodWorker,
        api: apps.prodApi,
        web: apps.prodWeb,
    };
    ledger.production = {
        ...(ledger.production ?? {}),
        rollbackAttempted: true,
        rollbackReason: "release-finalization-failed",
    };
    saveLedger();
    try {
        deploySet(prodApps, productionConfig, validatedBaseline);
        verifySet(prodApps, validatedBaseline);
        smoke("public-beta");
        ledger.production.rollbackVerified = true;
        ledger.production.status = "rolled-back";
        ledger.production.completedAt = now();
    } catch (error) {
        ledger.production.rollbackVerified = false;
        ledger.production.status = "rollback-failed";
        ledger.production.rollbackError =
            error instanceof Error ? error.message : String(error);
        ledger.production.completedAt = now();
        throw error;
    } finally {
        saveLedger();
    }
}

if (command === "rehearse") rehearse();
else if (command === "promote") promote();
else restoreProductionBaseline();
