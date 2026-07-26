#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { deployedReleaseTrainProbe } from "./lib/release-train-probe.mjs";

const required = (name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Required staging probe value is missing: ${name}`);
    return value;
};
const apps = {
    api: required("API_APP"),
    web: required("WEB_APP"),
    worker: required("WORKER_APP"),
};
const expectedEnvironment = process.argv[2] ?? "staging-debug";
const expectedRelease = required("ROSS_STAGING_DEBUG_RELEASE_ID");

function fly(args, { capture = false } = {}) {
    const result = spawnSync("flyctl", args, {
        encoding: "utf8",
        stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`flyctl ${args.join(" ")} failed (${result.status}): ${(result.stderr || result.stdout || "").trim().slice(-1000)}`);
    }
    return result.stdout;
}

function start(app) {
    const machines = JSON.parse(fly(["machine", "list", "--app", app, "--json"], { capture: true }));
    if (!machines.length) throw new Error(`${app} has no deployed Machine.`);
    for (const machine of machines) {
        const id = machine.id ?? machine.ID;
        const state = machine.state ?? machine.State;
        if (state !== "started") fly(["machine", "start", id, "--app", app]);
        fly(["machine", "wait", id, "--app", app, "--state", "started", "--wait-timeout", "2m"]);
    }
    return machines[0].id ?? machines[0].ID;
}

start(apps.worker);
start(apps.web);
const apiMachine = start(apps.api);
const encoded = Buffer.from(deployedReleaseTrainProbe).toString("base64");
const args = [
    `http://${apps.api}.flycast`,
    `http://${apps.web}.flycast`,
    `http://${apps.worker}.flycast`,
    `https://${apps.api}.fly.dev`,
    `https://${apps.web}.fly.dev`,
    expectedEnvironment,
    expectedRelease,
    "false",
    "true",
];
const command = [`node -e "eval(Buffer.from('${encoded}','base64').toString())"`, ...args.map(JSON.stringify)].join(" ");
fly(["ssh", "console", "--app", apps.api, "--machine", apiMachine, "--command", command]);
