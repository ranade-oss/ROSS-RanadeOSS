const APP_PATTERN = /^[a-z0-9][a-z0-9-]{2,61}[a-z0-9]$/;

export function stagingDebugNames(runId, attempt = "1") {
    if (!/^[1-9][0-9]*$/.test(String(runId)) || !/^[1-9][0-9]*$/.test(String(attempt))) {
        throw new Error("GitHub run ID and attempt must be positive integers.");
    }
    const suffix = `debug-${runId}-${attempt}`;
    return {
        api: `ross-api-${suffix}`,
        web: `ross-web-${suffix}`,
        worker: `ross-worker-${suffix}`,
    };
}

export function assertIsolatedStaging({ apps, productionApps = [], resources }) {
    const values = Object.values(apps);
    if (values.length !== 3 || new Set(values).size !== 3) {
        throw new Error("Debug API, web, and worker apps must be distinct.");
    }
    for (const app of values) {
        if (!APP_PATTERN.test(app) || !/-debug-[1-9][0-9]*-[1-9][0-9]*$/.test(app)) {
            throw new Error(`${app} is not an ephemeral staging-debug app.`);
        }
        if (productionApps.includes(app)) throw new Error(`${app} is a production app.`);
    }
    for (const name of ["supabaseUrl", "storageEndpoint"]) {
        const value = resources[name];
        if (!String(value ?? "").trim()) throw new Error(`Missing isolated staging resource: ${name}.`);
    }
    if ((resources.productionSupabaseUrl && resources.supabaseUrl === resources.productionSupabaseUrl) ||
        (resources.productionStorageEndpoint && resources.storageEndpoint === resources.productionStorageEndpoint)) {
        throw new Error("Staging data resources must not equal production resources.");
    }
    return { apps, resources };
}
