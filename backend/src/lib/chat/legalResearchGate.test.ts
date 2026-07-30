import assert from "node:assert/strict";
import test from "node:test";
import { requiresLegalSourceSearch } from "./legalResearchGate";

const user = (content: string) => [{ role: "user" as const, content }];

test("requires source discovery for explicit legal research requests", () => {
  assert.equal(
    requiresLegalSourceSearch(
      user("Research Ontario case law about summary judgment."),
    ),
    true,
  );
  assert.equal(
    requiresLegalSourceSearch(
      user("Verify this citation and check the current statute."),
    ),
    true,
  );
  assert.equal(
    requiresLegalSourceSearch(user("What is the limitation law in Ontario?")),
    true,
  );
});

test("does not start a new search for connector audit questions", () => {
  assert.equal(
    requiresLegalSourceSearch(user("Which connectors were actually used?")),
    false,
  );
  assert.equal(
    requiresLegalSourceSearch(user("Please summarize the document I attached.")),
    false,
  );
  assert.equal(
    requiresLegalSourceSearch(
      user("Use CourtListener to search for a U.S. equal protection case."),
    ),
    false,
  );
});
