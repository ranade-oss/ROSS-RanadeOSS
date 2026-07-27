#!/usr/bin/env node
import { runStagingDebugPreflight } from "./lib/staging-debug-preflight.mjs";

await runStagingDebugPreflight();
console.log("PASS: staging Supabase keys, schema, migrations, and storage bucket are readable.");
