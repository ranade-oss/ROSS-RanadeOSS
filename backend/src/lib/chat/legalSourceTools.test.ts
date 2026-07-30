import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLegalMaterialType } from "./tools/legalSourceTools";

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
