#!/usr/bin/env node
import { stagingDebugNames } from "./lib/staging-debug.mjs";

const names = stagingDebugNames(process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT);
for (const [component, app] of Object.entries(names)) {
    console.log(`${component.toUpperCase()}_APP=${app}`);
}
