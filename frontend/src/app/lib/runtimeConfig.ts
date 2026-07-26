export type RossPublicRuntimeConfig = {
    apiBaseUrl: string;
    appUrl: string;
    releaseId: string;
    signupsEnabled: boolean;
    environment: "development" | "rehearsal" | "public-beta";
};

declare global {
    interface Window {
        __ROSS_RUNTIME_CONFIG__?: RossPublicRuntimeConfig;
    }
}

const buildTimeConfig: RossPublicRuntimeConfig = {
    apiBaseUrl:
        process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
    appUrl: process.env.NEXT_PUBLIC_ROSS_APP_URL ?? "http://localhost:3000",
    releaseId: "build-time",
    signupsEnabled:
        process.env.NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED !== "false",
    environment:
        process.env.NODE_ENV === "production" ? "public-beta" : "development",
};

export function getRossRuntimeConfig(): RossPublicRuntimeConfig {
    if (
        typeof window !== "undefined" &&
        window.__ROSS_RUNTIME_CONFIG__
    ) {
        return window.__ROSS_RUNTIME_CONFIG__;
    }
    return buildTimeConfig;
}

export function getApiBaseUrl(): string {
    return getRossRuntimeConfig().apiBaseUrl;
}

export function areSignupsEnabled(): boolean {
    return getRossRuntimeConfig().signupsEnabled;
}
