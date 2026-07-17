import assert from "node:assert/strict";
import test from "node:test";
import {
  CITATIONS_OPEN_TAG,
  citationMarkerPrefixLengthAtEnd,
} from "./citations";

test("ordinary response endings are never held back", () => {
  assert.equal(citationMarkerPrefixLengthAtEnd("ROSS live stream test passed."), 0);
  assert.equal(citationMarkerPrefixLengthAtEnd("ordinary legal analysis"), 0);
});

test("only a possible split citation marker is buffered", () => {
  for (let length = 1; length < CITATIONS_OPEN_TAG.length; length += 1) {
    const prefix = CITATIONS_OPEN_TAG.slice(0, length);
    assert.equal(citationMarkerPrefixLengthAtEnd(`Visible answer${prefix}`), length);
  }
});

test("a citation marker split across chunks remains detectable", () => {
  const firstChunk = "Visible answer<CIT";
  const keep = citationMarkerPrefixLengthAtEnd(firstChunk);
  const visible = firstChunk.slice(0, firstChunk.length - keep);
  const tail = firstChunk.slice(firstChunk.length - keep);

  assert.equal(visible, "Visible answer");
  assert.equal(tail, "<CIT");
  assert.equal(`${tail}ATIONS>[]`.indexOf(CITATIONS_OPEN_TAG), 0);
});
