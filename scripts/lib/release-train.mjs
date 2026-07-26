import { execFileSync } from "node:child_process";

export const DIGEST_IMAGE_REF_PATTERN =
    /^registry\.fly\.io\/[a-z0-9][a-z0-9-]{2,61}[a-z0-9]@sha256:[a-f0-9]{64}$/;

export function validateDigestImageRef(value, label = "image reference") {
    if (
        typeof value !== "string" ||
        !DIGEST_IMAGE_REF_PATTERN.test(value)
    ) {
        throw new Error(
            `${label} must be an immutable registry.fly.io image digest reference.`,
        );
    }
    return value;
}

function objectField(object, names) {
    for (const name of names) {
        const value = object?.[name];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
}

function collectStrings(value, output) {
    if (typeof value === "string") {
        output.push(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) collectStrings(item, output);
        return;
    }
    if (value && typeof value === "object") {
        for (const item of Object.values(value)) collectStrings(item, output);
    }
}

export function extractDigestImageRef(payload, label = "Fly image") {
    const candidates = [];
    collectStrings(payload, candidates);
    for (const candidate of candidates) {
        const match = candidate.match(
            /registry\.fly\.io\/[a-z0-9][a-z0-9-]{2,61}[a-z0-9]@sha256:[a-f0-9]{64}/,
        );
        if (match) return validateDigestImageRef(match[0], label);
    }

    const records = Array.isArray(payload) ? payload : [payload];
    for (const record of records) {
        if (!record || typeof record !== "object") continue;
        const registry = objectField(record, ["Registry", "registry"]);
        const repository = objectField(record, [
            "Repository",
            "repository",
            "repo",
        ]);
        const digest = objectField(record, ["Digest", "digest"]);
        if (!registry || !repository || !digest) continue;
        const normalizedRegistry = registry.replace(/\/+$/, "");
        const ref = `${normalizedRegistry}/${repository}@${digest}`;
        if (DIGEST_IMAGE_REF_PATTERN.test(ref)) return ref;
    }

    throw new Error(`${label} did not contain an immutable image digest.`);
}

export function resolvePushedImageRef(
    taggedImage,
    { exec = execFileSync } = {},
) {
    if (
        typeof taggedImage !== "string" ||
        !/^registry\.fly\.io\/[a-z0-9][a-z0-9-]{2,61}[a-z0-9]:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(
            taggedImage,
        )
    ) {
        throw new Error("Candidate image tag is invalid.");
    }
    const manifest = JSON.parse(
        exec(
            "docker",
            [
                "buildx",
                "imagetools",
                "inspect",
                taggedImage,
                "--format",
                "{{json .Manifest}}",
            ],
            { encoding: "utf8" },
        ),
    );
    const digest = manifest?.digest;
    if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? "")) {
        throw new Error(`Registry manifest for ${taggedImage} has no digest.`);
    }
    return validateDigestImageRef(
        `${taggedImage.slice(0, taggedImage.lastIndexOf(":"))}@${digest}`,
        "candidate image",
    );
}

function torontoDate(now) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    const part = (type) => parts.find((item) => item.type === type)?.value;
    return `${part("year")}${part("month")}${part("day")}`;
}

export function nextPublicReleaseId(tags, now = new Date()) {
    const date = torontoDate(now);
    const pattern = new RegExp(
        `^ross-public-beta-${date}-rc([1-9][0-9]*)$`,
    );
    let greatest = 0;
    for (const tag of tags) {
        const match = String(tag).trim().match(pattern);
        if (match) greatest = Math.max(greatest, Number(match[1]));
    }
    return `ross-public-beta-${date}-rc${greatest + 1}`;
}

export function assertReleaseTrainAppNames(apps) {
    const entries = Object.entries(apps);
    for (const [label, app] of entries) {
        if (
            typeof app !== "string" ||
            !/^[a-z0-9][a-z0-9-]{2,61}[a-z0-9]$/.test(app)
        ) {
            throw new Error(`${label} is not a valid Fly app name.`);
        }
    }
    if (new Set(entries.map(([, app]) => app)).size !== entries.length) {
        throw new Error("Every production and rehearsal Fly app must be distinct.");
    }
    for (const label of ["stageApi", "stageWeb", "stageWorker"]) {
        if (!apps[label].endsWith("-rehearsal")) {
            throw new Error(`${label} must end with -rehearsal.`);
        }
    }
    return apps;
}
