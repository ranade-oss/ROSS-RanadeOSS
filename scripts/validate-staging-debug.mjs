#!/usr/bin/env node
import { assertIsolatedStaging, stagingDebugNames } from "./lib/staging-debug.mjs";

const required = (name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Required staging-debug value is missing: ${name}`);
    return value;
};
const apps = stagingDebugNames(required("GITHUB_RUN_ID"), required("GITHUB_RUN_ATTEMPT"));
assertIsolatedStaging({
    apps,
    productionApps: ["ross-ranadeoss-api", "ross-ranadeoss-public", "ross-ranadeoss-file-worker"],
    resources: {
        supabaseUrl: required("ROSS_STAGING_SUPABASE_URL"),
        storageEndpoint: required("ROSS_STAGING_S3_ENDPOINT_URL"),
        productionSupabaseUrl: process.env.ROSS_PRODUCTION_SUPABASE_URL,
        productionStorageEndpoint: process.env.ROSS_PRODUCTION_S3_ENDPOINT_URL,
    },
});
for (const [component, app] of Object.entries(apps)) {
    console.log(`${component.toUpperCase()}_APP=${app}`);
}
