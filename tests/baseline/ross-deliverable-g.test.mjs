import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));

test("Deliverable G records verified public registration without expanding the data boundary", () => {
  const boundary = read("docs/product-boundary.md");
  const plan = json("config/final-completion.v1.json");

  assert.match(boundary, /public-registration web application/i);
  assert.match(boundary, /anonymous uploads and AI requests are not permitted/i);
  assert.equal(plan.target.release, "public-registration Ontario controlled beta");
  assert.equal(plan.target.confidentialUseApproved, false);
  assert.equal(plan.target.publicIndexingApproved, false);
  assert.equal(plan.providerStrategy.canliiWebsiteAutomationAllowed, false);
});

test("public deployment is manual, gated, verified-email only, and separately reversible", () => {
  const publicWorkflow = read(".github/workflows/deploy-public-beta-ross.yml");
  const privateWorkflow = read(".github/workflows/deploy-private-ross.yml");

  assert.match(publicWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(publicWorkflow, /^\s*push:/m);
  assert.match(publicWorkflow, /environment: public-beta/);
  assert.match(publicWorkflow, /verify-final-release-id\.mjs/);
  assert.match(publicWorkflow, /npm run final:check/);
  assert.match(publicWorkflow, /ROSS_REQUIRE_VERIFIED_EMAIL=true/);
  assert.match(publicWorkflow, /NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED=true/);
  assert.match(publicWorkflow, /RATE_LIMIT_CHAT_MAX=20/);
  assert.match(publicWorkflow, /--no-cache/);
  assert.match(privateWorkflow, /NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED=false/);
});

test("signup records versioned policies and waits for email verification", () => {
  const signup = read("frontend/src/app/signup/page.tsx");
  const auth = read("backend/src/middleware/auth.ts");
  const schema = read("backend/schema.sql");
  const migration = read("backend/migrations/20260717_02_public_beta_registration.sql");

  assert.match(signup, /ross_terms_version/);
  assert.match(signup, /ross_privacy_version/);
  assert.match(signup, /synthetic-or-non-confidential/);
  assert.match(signup, /Verify your email/);
  assert.doesNotMatch(signup, /setTimeout\(/);
  assert.match(auth, /ROSS_REQUIRE_VERIFIED_EMAIL/);
  assert.match(auth, /email_confirmed_at/);
  for (const column of [
    "terms_version",
    "terms_accepted_at",
    "privacy_notice_version",
    "privacy_acknowledged_at",
    "registration_source",
  ]) {
    assert.match(schema, new RegExp(column));
    assert.match(migration, new RegExp(column));
  }
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.user_profiles from anon, authenticated/i);
});

test("public website offers account creation and states the hosted boundary", () => {
  const shell = read("website/app/site-shell.tsx");
  const landing = read("website/app/page.tsx");
  const brand = json("config/ross-brand.json");

  assert.match(shell, /Create account/);
  assert.match(landing, /Verified public registration/);
  assert.match(landing, /bring a model[\s\S]*API key/i);
  assert.match(brand.product.betaLabel, /verified account required/i);
  assert.match(brand.product.betaLabel, /synthetic or non-confidential/i);
});
