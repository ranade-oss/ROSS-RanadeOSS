import assert from "node:assert/strict";
import test from "node:test";
import {
  legalSourceIdMatchesProvider,
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

test("provider-specific source ids reject cross-connector fetches", () => {
  assert.equal(
    legalSourceIdMatchesProvider("ontario-elaws", "ontario-statute-90c43"),
    true,
  );
  assert.equal(
    legalSourceIdMatchesProvider("ontario-elaws", "2024 ONCA 1"),
    false,
  );
  assert.equal(
    legalSourceIdMatchesProvider("justice-laws-canada", "federal-act-p-21"),
    true,
  );
  assert.equal(
    legalSourceIdMatchesProvider(
      "justice-laws-canada",
      "ontario-statute-90c43",
    ),
    false,
  );
  assert.equal(
    legalSourceIdMatchesProvider("canlii-licensed", "2016 SCC 27"),
    true,
  );
  assert.equal(
    legalSourceIdMatchesProvider("canlii-licensed", "federal-act-p-21"),
    false,
  );
  assert.equal(
    legalSourceIdMatchesProvider("a2aj-canada", "2024 ONCA 1"),
    null,
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
