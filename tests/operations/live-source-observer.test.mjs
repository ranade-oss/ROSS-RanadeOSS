import assert from "node:assert/strict";
import test from "node:test";
import {
  observeLiveLegalSources,
  requiredLiveProviderIds,
} from "../../scripts/lib/live-source-observer.mjs";

const caseCoverage = JSON.stringify({
  coverage: [
    { dataset: "ONCA", count: 100 },
    { dataset: "SCC", count: 200 },
  ],
});
const lawCoverage = JSON.stringify({
  coverage: [
    { dataset: "LEGISLATION-ON", count: 300 },
    { dataset: "REGULATIONS-ON", count: 400 },
  ],
});
const legislation = `<Statute>${"Ontario and Canadian law ".repeat(30)}</Statute>`;
const justiceLookup = `<Database><Statutes><Statute><Language>en</Language><ConsolidateFlag>true</ConsolidateFlag><ChapterNumber>P-21</ChapterNumber><ShortTitle>Privacy Act</ShortTitle></Statute></Statutes>${"catalogue ".repeat(60)}</Database>`;
const ontarioDocument = JSON.stringify({
  content: `<p>${"Ontario legislation content ".repeat(30)}</p>`,
});

const requestedA2ajDocTypes = [];
const requestedA2ajSearches = [];
const successfulFetch = async (url) => {
  if (url.includes("api.a2aj.ca")) {
    const parsed = new URL(url);
    const docType = parsed.searchParams.get("doc_type");
    if (parsed.pathname === "/search") {
      requestedA2ajSearches.push(parsed);
      const isLaw = docType === "laws";
      return Response.json({
        results: [
          {
            citation_en: isLaw ? "R.S.O. 1990, c. C.43" : "2024 ONCA 123",
            ...(isLaw
              ? { source_url_en: "https://www.ontario.ca/laws/statute/90c43" }
              : {}),
          },
        ],
      });
    }
    if (parsed.pathname === "/fetch") {
      return Response.json({
        result: {
          citation_en: parsed.searchParams.get("citation"),
          unofficial_text_en: "SYNTHETIC source passage.",
        },
      });
    }
    requestedA2ajDocTypes.push(docType);
    return new Response(docType === "laws" ? lawCoverage : caseCoverage, {
      status: 200,
      headers: {
        "content-type": "application/json",
        etag: `"coverage-${docType}-v1"`,
      },
    });
  }
  if (url.includes("ontario.ca/laws/api")) {
    return new Response(
      url.endsWith("/currency-date") ? "July 10, 2026" : ontarioDocument,
      { status: 200 },
    );
  }
  if (url.endsWith("/lookup/lookup.xml"))
    return new Response(justiceLookup, { status: 200 });
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
  assert.deepEqual(requestedA2ajDocTypes.sort(), ["cases", "laws"]);
  assert.equal(requestedA2ajSearches.length, 3);
  for (const search of requestedA2ajSearches.slice(0, 2)) {
    assert.equal(search.searchParams.get("size"), "50");
    assert.equal(search.searchParams.get("search_language"), "en");
    assert.equal(search.searchParams.get("start_date"), "2000-01-01");
    assert.equal(search.searchParams.get("end_date"), "2099-12-31");
    assert.equal(search.searchParams.has("from"), false);
    assert.equal(search.searchParams.has("date_from"), false);
    assert.equal(search.searchParams.has("date_to"), false);
  }
  const ontarioDiscovery = requestedA2ajSearches[2];
  assert.equal(ontarioDiscovery.searchParams.get("dataset"), "LEGISLATION-ON");
  assert.equal(ontarioDiscovery.searchParams.get("size"), "1");
  assert.equal(ontarioDiscovery.searchParams.get("search_language"), "en");
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /https?:\/\//);
  assert.doesNotMatch(serialized, /Ontario and Canadian law/);
});

test("a required provider failure degrades the observation without exposing response bodies", async () => {
  const fetchImpl = async (url) => {
    if (!url.includes("api.a2aj.ca")) return successfulFetch(url);
    const docType = new URL(url).searchParams.get("doc_type");
    return docType === "laws"
      ? new Response("private upstream diagnostic", { status: 503 })
      : new Response(caseCoverage, { status: 200 });
  };
  const report = await observeLiveLegalSources({
    fetchImpl,
    now: () => new Date("2026-07-17T12:00:00Z"),
  });

  assert.equal(report.status, "degraded");
  assert.equal(report.providers["a2aj-canada"].reasonCode, "http-503");
  assert.doesNotMatch(JSON.stringify(report), /private upstream diagnostic/);
});

test("split coverage validation rejects an Ontario law missing from the laws response", async () => {
  const fetchImpl = async (url) => {
    if (!url.includes("api.a2aj.ca")) return successfulFetch(url);
    const docType = new URL(url).searchParams.get("doc_type");
    return new Response(
      docType === "laws"
        ? JSON.stringify({ coverage: [{ dataset: "LEGISLATION-ON" }] })
        : caseCoverage,
      { status: 200 },
    );
  };
  const report = await observeLiveLegalSources({ fetchImpl });
  assert.equal(report.status, "degraded");
  assert.equal(
    report.providers["a2aj-canada"].reasonCode,
    "coverage-missing-required-ontario-dataset",
  );
});
