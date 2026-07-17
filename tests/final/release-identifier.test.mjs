import assert from "node:assert/strict";
import test from "node:test";
import {
  validateReleaseId,
  verifyImmutableTag,
} from "../../scripts/lib/release-identifier.mjs";

test("accepts a reserved public-beta release identifier", () => {
  assert.equal(
    validateReleaseId("ross-public-beta-20260717-rc1"),
    "ross-public-beta-20260717-rc1",
  );
});

test("rejects unassigned and malformed release identifiers", () => {
  assert.throws(() => validateReleaseId("unassigned"), /must use/);
  assert.throws(() => validateReleaseId("ross-rc-20260717-deadbeef"), /must use/);
});

test("immutable tag must point to the checked-out commit", () => {
  const matching = (_command, args) =>
    args[0] === "rev-list" ? "abc123\n" : "abc123\n";
  assert.equal(
    verifyImmutableTag("ross-public-beta-20260717-rc1", {
      execFileSync: matching,
    }),
    "abc123",
  );

  const mismatching = (_command, args) =>
    args[0] === "rev-list" ? "abc123\n" : "def456\n";
  assert.throws(
    () =>
      verifyImmutableTag("ross-public-beta-20260717-rc1", {
        execFileSync: mismatching,
      }),
    /not checked-out commit/,
  );
});
