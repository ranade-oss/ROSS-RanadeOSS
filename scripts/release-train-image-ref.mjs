#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
    extractDigestImageRef,
    nextPublicReleaseId,
    resolvePushedImageRef,
    validateDigestImageRef,
} from "./lib/release-train.mjs";

const [command, ...args] = process.argv.slice(2);

function usage() {
    throw new Error(
        "Usage: release-train-image-ref.mjs current <app> | resolve <tag> | verify <app> <digest-ref> | next-id | validate <digest-ref>",
    );
}

function currentImage(app) {
    if (!app) usage();
    const payload = JSON.parse(
        execFileSync(
            "flyctl",
            ["image", "show", "--app", app, "--json"],
            { encoding: "utf8" },
        ),
    );
    return extractDigestImageRef(payload, `${app} current image`);
}

switch (command) {
    case "current":
        process.stdout.write(`${currentImage(args[0])}\n`);
        break;
    case "resolve":
        if (!args[0]) usage();
        process.stdout.write(`${resolvePushedImageRef(args[0])}\n`);
        break;
    case "verify": {
        if (!args[0] || !args[1]) usage();
        const expected = validateDigestImageRef(args[1]);
        const actual = currentImage(args[0]);
        if (actual !== expected) {
            throw new Error(
                `${args[0]} runs ${actual}, expected ${expected}.`,
            );
        }
        process.stdout.write(`${actual}\n`);
        break;
    }
    case "next-id": {
        const tags = execFileSync(
            "git",
            ["tag", "--list", "ross-public-beta-*-rc*"],
            { encoding: "utf8" },
        )
            .split(/\r?\n/)
            .filter(Boolean);
        process.stdout.write(`${nextPublicReleaseId(tags)}\n`);
        break;
    }
    case "validate":
        if (!args[0]) usage();
        process.stdout.write(`${validateDigestImageRef(args[0])}\n`);
        break;
    default:
        usage();
}
