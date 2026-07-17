import assert from "node:assert/strict";
import test from "node:test";
import {
  observeLiveLegalSources,
  requiredLiveProviderIds,
} from "../../scripts/lib/live-source-observer.mjs";

const coverage = JSON.stringify({
  coverage: [
    { dataset: "ONCA", count: 100 },
    { dataset: "LEGISLATION-ON", count: 300 },
    { dataset: "REGULATIONS-ON", count: 400 },
    { dataset: "SCC", count: 200 },
  ],
});
const legislation = `<Statute>${"Ontario and Canadian law ".repeat(30)}</Statute>`;

const successfulFetch = async (url) => {
  if (url.includes("api.a2aj.ca"))
    return new Response(coverage, {
      status: 200,
      headers: { "content-type": "application/json", etag: '"coverage-v1"' },
    });
  return new Response(legislation, { status: 200 });
};

test("live source observation records only sanitized operational metadata", async () => {
  const report = await observeLiveLegalSources({
    fetchImpl: successfulFetch,
    now: () => new Date("2026-07-17T12:00:00Z"),
    clock: (() => {
      let value = 0;
      return () => (value += 25);
    })(),
  });

  assert.equal(report.status, "healthy");
  assert.equal(report.liveChecksPerformed, true);
  for (const id of requiredLiveProviderIds)
    assert.equal(report.providers[id].state, "healthy");
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /https?:\/\//);
  assert.doesNotMatch(serialized, /Ontario and Canadian law/);
});

test("a required provider failure degrades the observation without exposing response bodies", async () => {
  const fetchImpl = async (url) =>
    url.includes("api.a2aj.ca")
      ? new Response("private upstream diagnostic", { status: 503 })
      : new Response(legislation, { status: 200 });
  const report = await observeLiveLegalSources({
    fetchImpl,
    now: () => new Date("2026-07-17T12:00:00Z"),
  });

  assert.equal(report.status, "degraded");
  assert.equal(report.providers["a2aj-canada"].reasonCode, "http-503");
  assert.doesNotMatch(JSON.stringify(report), /private upstream diagnostic/);
});
