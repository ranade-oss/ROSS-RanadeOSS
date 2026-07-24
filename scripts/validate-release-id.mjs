#!/usr/bin/env node

import { validateReleaseId } from "./lib/release-identifier.mjs";

const releaseId = validateReleaseId(
  process.argv[2] ??
    process.env.ROSS_RELEASE_ID ??
    process.env.INPUT_RELEASE_ID,
);

console.log(`PASS: release ID ${releaseId} uses ross-public-beta-YYYYMMDD-rcN.`);
