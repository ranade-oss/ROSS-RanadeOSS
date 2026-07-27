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

export function normalizeResourceUrl(value, label) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${label} must be a valid absolute URL.`);
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error(`${label} must be a credential-free HTTPS URL without query or fragment.`);
    }
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${path}`;
}

export function assertIsolatedStaging({ apps, productionApps = [], stagingOrg, productionOrg, resources }) {
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
    for (const name of ["productionSupabaseUrl", "productionStorageEndpoint"]) {
        if (!String(resources[name] ?? "").trim()) {
            throw new Error(`Missing production comparison identifier: ${name}.`);
        }
    }
    if (productionApps.length !== 3 || productionApps.some((app) => !String(app).trim())) {
        throw new Error("All production app comparison identifiers are required.");
    }
    if (!String(stagingOrg ?? "").trim() || !String(productionOrg ?? "").trim()) {
        throw new Error("Dedicated staging and production Fly organization identifiers are required.");
    }
    if (stagingOrg.trim().toLowerCase() === productionOrg.trim().toLowerCase()) {
        throw new Error("The staging Fly organization must not equal the production organization.");
    }
    const stagingSupabase = normalizeResourceUrl(resources.supabaseUrl, "staging Supabase URL");
    const productionSupabase = normalizeResourceUrl(resources.productionSupabaseUrl, "production Supabase URL");
    const stagingStorage = normalizeResourceUrl(resources.storageEndpoint, "staging storage URL");
    const productionStorage = normalizeResourceUrl(resources.productionStorageEndpoint, "production storage URL");
    if (stagingSupabase === productionSupabase || stagingStorage === productionStorage) {
        throw new Error("Staging data resources must not equal production resources.");
    }
    return { apps, resources };
}
