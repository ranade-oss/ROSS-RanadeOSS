import "server-only";

import type { RossPublicRuntimeConfig } from "./runtimeConfig";

function httpOrigin(value: string, label: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${label} must be an absolute HTTP(S) URL.`);
    }
    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error(`${label} must use HTTP or HTTPS.`);
    }
    if (url.pathname !== "/" || url.search || url.hash) {
        throw new Error(`${label} must be an origin without a path, query, or hash.`);
    }
    return url.origin;
}

function runtimeEnvironment(
    value: string | undefined,
): RossPublicRuntimeConfig["environment"] {
    if (!value) {
        return process.env.NODE_ENV === "production"
            ? "public-beta"
            : "development";
    }
    if (
        value === "development" ||
        value === "rehearsal" ||
        value === "public-beta"
    ) {
        return value;
    }
    throw new Error(
        "ROSS_RUNTIME_ENVIRONMENT must be development, rehearsal, or public-beta.",
    );
}

export function readRossRuntimeConfig(): RossPublicRuntimeConfig {
    const apiBaseUrl = httpOrigin(
        process.env.ROSS_RUNTIME_API_BASE_URL ??
            process.env.NEXT_PUBLIC_API_BASE_URL ??
            "http://localhost:3001",
        "ROSS_RUNTIME_API_BASE_URL",
    );
    const appUrl = httpOrigin(
        process.env.ROSS_RUNTIME_APP_URL ??
            process.env.NEXT_PUBLIC_ROSS_APP_URL ??
            "http://localhost:3000",
        "ROSS_RUNTIME_APP_URL",
    );
    const signupsValue =
        process.env.ROSS_RUNTIME_SIGNUPS_ENABLED ??
        process.env.NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED ??
        "true";
    if (signupsValue !== "true" && signupsValue !== "false") {
        throw new Error(
            "ROSS_RUNTIME_SIGNUPS_ENABLED must be true or false.",
        );
    }

    return {
        apiBaseUrl,
        appUrl,
        releaseId:
            process.env.ROSS_RUNTIME_RELEASE_ID?.trim() ||
            process.env.ROSS_BUILD_RELEASE_ID?.trim() ||
            process.env.ROSS_RELEASE_ID?.trim() ||
            "development",
        signupsEnabled: signupsValue === "true",
        environment: runtimeEnvironment(
            process.env.ROSS_RUNTIME_ENVIRONMENT,
        ),
    };
}

export function serializeRossRuntimeConfig(
    config: RossPublicRuntimeConfig,
): string {
    return JSON.stringify(config)
        .replaceAll("<", "\\u003c")
        .replaceAll(">", "\\u003e")
        .replaceAll("&", "\\u0026")
        .replaceAll("\u2028", "\\u2028")
        .replaceAll("\u2029", "\\u2029");
}
