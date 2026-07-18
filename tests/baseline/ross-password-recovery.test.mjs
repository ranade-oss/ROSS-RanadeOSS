import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("login links to a complete Supabase password-recovery flow", () => {
  const login = read("frontend/src/app/login/page.tsx");
  const forgot = read("frontend/src/app/forgot-password/page.tsx");
  const reset = read("frontend/src/app/reset-password/page.tsx");

  assert.match(login, /href="\/forgot-password"/);
  assert.match(forgot, /resetPasswordForEmail/);
  assert.match(forgot, /\/reset-password/);
  assert.match(forgot, /whether or not an account\s+exists/i);
  assert.match(reset, /exchangeCodeForSession/);
  assert.match(reset, /PASSWORD_RECOVERY/);
  assert.match(reset, /updateUser\(\{\s*password/s);
  assert.match(reset, /signOut\(\{ scope: "local" \}\)/);
});

test("password-recovery forms expose accessible labels and live feedback", () => {
  const forgot = read("frontend/src/app/forgot-password/page.tsx");
  const reset = read("frontend/src/app/reset-password/page.tsx");

  for (const source of [forgot, reset]) {
    assert.match(source, /role="alert"/);
    assert.match(source, /aria-live="assertive"/);
    assert.match(source, /role="status"/);
    assert.match(source, /focus-visible:ring-2/);
  }
  assert.match(forgot, /autoComplete="email"/);
  assert.match(reset, /autoComplete="new-password"/);
  assert.match(reset, /minLength=\{12\}/);
});

test("private deployment rejects malformed or mismatched Supabase settings", () => {
  const workflow = read(".github/workflows/deploy-private-ross.yml");

  assert.match(workflow, /ROSS_SUPABASE_URL must be the HTTPS project origin/);
  assert.match(workflow, /\/auth\/v1\/settings/);
  assert.match(workflow, /ROSS_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(workflow, /ROSS_SUPABASE_SECRET_KEY/);
  assert.match(workflow, /does not authenticate against ROSS_SUPABASE_URL/);
});
