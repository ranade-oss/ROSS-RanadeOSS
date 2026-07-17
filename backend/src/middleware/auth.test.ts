import assert from "node:assert/strict";
import test from "node:test";
import { requiresVerifiedEmail } from "./auth";

test("public hosted access rejects users without confirmed email", () => {
  assert.equal(requiresVerifiedEmail({}, true), true);
  assert.equal(requiresVerifiedEmail({ email_confirmed_at: null }, true), true);
});

test("confirmed users and deployments without the public gate are unchanged", () => {
  assert.equal(
    requiresVerifiedEmail(
      { email_confirmed_at: "2026-07-17T00:00:00.000Z" },
      true,
    ),
    false,
  );
  assert.equal(requiresVerifiedEmail({}, false), false);
});
