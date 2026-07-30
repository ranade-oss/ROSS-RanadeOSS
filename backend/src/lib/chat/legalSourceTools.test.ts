import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeLegalMaterialType,
  summarizeCitationVerification,
} from "./tools/legalSourceTools";

test("selected-source fetches use the provider's supported material family", () => {
  assert.equal(
    normalizeLegalMaterialType("fetch_legal_source", "decision", {
      fetchDecision: false,
      fetchLegislation: true,
    }),
    "legislation",
  );
  assert.equal(
    normalizeLegalMaterialType("find_in_legal_source", "legislation", {
      fetchDecision: true,
      fetchLegislation: false,
    }),
    "decision",
  );
  assert.equal(
    normalizeLegalMaterialType("search_legal_sources", "decision", {
      fetchDecision: false,
      fetchLegislation: true,
    }),
    "decision",
  );
});

test("tool completion never upgrades unverified citations", () => {
  assert.deepEqual(
    summarizeCitationVerification([
      { citationVerification: "unverified" },
      { citationVerification: "unavailable" },
      { citationVerification: "partial" },
    ]),
    {
      citationCount: 3,
      verifiedCount: 0,
      partialCount: 1,
      unverifiedCount: 2,
    },
  );
});
