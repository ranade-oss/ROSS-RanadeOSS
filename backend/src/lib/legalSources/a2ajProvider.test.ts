import assert from "node:assert/strict";
import test from "node:test";
import { A2ajApiError, A2ajClient } from "./a2ajClient";
import { A2ajProvider } from "./a2ajProvider";

const syntheticDecision = {
  dataset: "ONCA",
  citation_en: "2025 ONCA 999",
  citation_fr: "",
  citation2_en: "",
  citation2_fr: "",
  name_en: "Synthetic Applicant v. Synthetic Respondent",
  name_fr: "",
  document_date_en: "2025-03-04T00:00:00",
  document_date_fr: "",
  url_en: "https://example.invalid/official/2025-onca-999",
  url_fr: "",
  unofficial_text_en:
    "[1] This is a SYNTHETIC decision.\n\n[2] The synthetic housing issue is allowed.",
  unofficial_text_fr: "",
  scraped_timestamp_en: "2025-03-05T12:00:00Z",
  scraped_timestamp_fr: "",
  cases_cited_en: ["2020 SCC 5"],
  cases_cited_fr: null,
  cases_citing_en: [],
  cases_citing_fr: null,
  citing_cases_count: 0,
  upstream_license: "SYNTHETIC TEST LICENCE",
};

const syntheticLegislation = {
  ...syntheticDecision,
  dataset: "LEGISLATION-ON",
  citation_en: "S.O. 2025, c. 1",
  name_en: "Synthetic Ontario Act, 2025",
  document_date_en: "2025-01-01T00:00:00",
  url_en: "https://example.invalid/official/synthetic-act",
  source_url_en: "https://www.ontario.ca/laws/statute/25s01",
  unofficial_text_en:
    "1 Short title\nThis Act may be cited as the Synthetic Ontario Act.\n2 Application\nThis section applies only to synthetic tests.",
  cases_cited_en: null,
  cases_citing_en: null,
  citing_cases_count: null,
};

test("A2AJ client sends bounded documented search parameters", async () => {
  const urls: string[] = [];
  const client = new A2ajClient({
    fetchImpl: async (input) => {
      urls.push(String(input));
      return Response.json({ results: [syntheticDecision], total: 1 });
    },
  });
  const result = await client.search({
    query: "housing",
    dataset: "ONCA",
    language: "en",
    size: 5,
    offset: 10,
    from: "2024-01-01",
    to: "2024-12-31",
  });
  assert.equal(result.results.length, 0);
  const url = new URL(urls[0]);
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("doc_type"), "cases");
  assert.equal(url.searchParams.get("dataset"), "ONCA");
  assert.equal(url.searchParams.get("size"), "15");
  assert.equal(url.searchParams.get("search_language"), "en");
  assert.equal(url.searchParams.get("start_date"), "2024-01-01");
  assert.equal(url.searchParams.get("end_date"), "2024-12-31");
  assert.equal(url.searchParams.has("from"), false);
  assert.equal(url.searchParams.has("date_from"), false);
  assert.equal(url.searchParams.has("date_to"), false);

  await client.search({
    query: "synthetic act",
    docType: "laws",
    dataset: "LEGISLATION-ON",
  });
  const lawUrl = new URL(urls[1]);
  assert.equal(lawUrl.searchParams.get("doc_type"), "laws");
  assert.equal(lawUrl.searchParams.get("dataset"), "LEGISLATION-ON");

  await client.search({ query: "negligence", size: 100 });
  const boundedUrl = new URL(urls[2]);
  assert.equal(boundedUrl.searchParams.get("size"), "50");

  const beyondWindow = await client.search({
    query: "negligence",
    offset: 50,
  });
  assert.deepEqual(beyondWindow.results, []);
  assert.equal(urls.length, 3);

  await client.coverage("cases");
  await client.coverage("laws");
  const caseCoverageUrl = new URL(urls[3]);
  const lawCoverageUrl = new URL(urls[4]);
  assert.equal(caseCoverageUrl.pathname, "/coverage");
  assert.equal(caseCoverageUrl.searchParams.get("doc_type"), "cases");
  assert.equal(lawCoverageUrl.pathname, "/coverage");
  assert.equal(lawCoverageUrl.searchParams.get("doc_type"), "laws");
});

test("A2AJ client retries transient failures and opens its circuit", async () => {
  let calls = 0;
  const delays: number[] = [];
  const retrying = new A2ajClient({
    maxRetries: 1,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("busy", { status: 503 })
        : Response.json({ results: [syntheticDecision] });
    },
  });
  await retrying.search({ query: "housing" });
  assert.equal(calls, 2);
  assert.deepEqual(delays, [250]);

  const failing = new A2ajClient({
    maxRetries: 0,
    failureThreshold: 2,
    fetchImpl: async () => new Response("busy", { status: 503 }),
  });
  await assert.rejects(
    () => failing.coverage("cases"),
    (error) => error instanceof A2ajApiError && error.status === 503,
  );
  await assert.rejects(
    () => failing.coverage("laws"),
    (error) => error instanceof A2ajApiError && error.status === 503,
  );
  await assert.rejects(
    () => failing.coverage("cases"),
    /circuit breaker is open/,
  );
});

test("A2AJ provider maps Ontario metadata and grounded passages", async () => {
  const client = {
    search: async () => ({ results: [syntheticDecision], total: 1 }),
    fetchByCitation: async () => syntheticDecision,
    coverage: async () => [
      {
        dataset: "ONCA",
        number_of_documents: 1,
        earliest_document_date: "2025-03-04",
        latest_document_date: "2025-03-04",
      },
    ],
  } as unknown as A2ajClient;
  const provider = new A2ajProvider(client);
  const [summary] = await provider.searchDecisions({
    query: "housing",
    jurisdiction: "CA-ON",
  });
  assert.equal(summary.jurisdiction, "CA-ON");
  assert.equal(summary.court, "Ontario Court of Appeal");
  assert.equal(summary.fullTextStatus, "unofficial");
  assert.equal(summary.canonicalUrl, syntheticDecision.url_en);
  assert.equal(summary.upstreamLicense, "SYNTHETIC TEST LICENCE");

  const document = await provider.fetchDecision("2025 ONCA 999");
  const passages = provider.findPassages(document, "housing allowed");
  assert.equal(passages.length, 1);
  assert.equal(passages[0].paragraphStart, 2);
  assert.match(passages[0].text, /housing issue is allowed/);
  assert.equal(passages[0].verification, "partial");

  const coverage = await provider.coverage();
  assert.equal(coverage[0].dataset, "ONCA");
  assert.equal(coverage[0].documentCount, 1);
});

test("A2AJ provider discovers Ontario legislation while retaining unofficial-source limits", async () => {
  const searches: Array<Record<string, unknown>> = [];
  const fetches: Array<[string, string | undefined]> = [];
  const client = {
    search: async (input: Record<string, unknown>) => {
      searches.push(input);
      return { results: [syntheticLegislation], total: 1 };
    },
    fetchByCitation: async (citation: string, docType?: string) => {
      fetches.push([citation, docType]);
      return syntheticLegislation;
    },
    coverage: async () => [],
  } as unknown as A2ajClient;
  const provider = new A2ajProvider(client);
  const [summary] = await provider.searchLegislation({
    query: "synthetic act",
    jurisdiction: "CA-ON",
    kind: "legislation",
    limit: 5,
  });
  assert.equal(searches.length, 1);
  assert.equal(searches[0].docType, "laws");
  assert.equal(searches[0].dataset, "LEGISLATION-ON");
  assert.equal(summary.jurisdiction, "CA-ON");
  assert.equal(summary.kind, "legislation");
  assert.equal(summary.verification, "partial");
  assert.equal(summary.canonicalUrl, syntheticLegislation.source_url_en);

  const document = await provider.fetchLegislation(summary.sourceId, {
    section: "2",
  });
  assert.deepEqual(fetches, [["S.O. 2025, c. 1", "laws"]]);
  assert.equal(document.reproductionIsOfficial, false);
  assert.equal(document.sections.length, 1);
  assert.match(document.sections[0].text, /synthetic tests/);
});

test("A2AJ provider validates and exercises the complete live-style catalogue", async () => {
  const decisionDatasets = [
    "SCC",
    "FCA",
    "BCCA",
    "ONCA",
    "NSCA",
    "YKCA",
    "FC",
    "TCC",
    "CMAC",
    "BCSC",
    "NSSC",
    "NSPC",
    "NSFC",
    "NSSM",
    "CHRT",
    "CIRB",
    "CITT",
    "CT",
    "FPSLREB",
    "OHSTC",
    "OIC",
    "PSDPT",
    "RAD",
    "RPD",
    "RLLR",
    "SST",
  ];
  const lawJurisdictions = [
    "FED",
    "ON",
    "BC",
    "AB",
    "NS",
    "YT",
    "MB",
    "NB",
    "NL",
    "NT",
    "SK",
  ];
  const lawDatasets = lawJurisdictions.flatMap((code) => [
    `LEGISLATION-${code}`,
    `REGULATIONS-${code}`,
  ]);
  const requested = new Set<string>();
  const coverageRequests: string[] = [];
  const client = {
    coverage: async (docType: "cases" | "laws") => {
      coverageRequests.push(docType);
      const datasets = docType === "cases" ? decisionDatasets : lawDatasets;
      return datasets.map((dataset) => ({
        dataset,
        count: 1,
        first_date: "2000-01-01",
        last_date: "2026-07-19",
      }));
    },
    search: async (input: { dataset?: string; docType?: string }) => {
      const dataset = input.dataset ?? "SCC";
      requested.add(dataset);
      const source =
        input.docType === "laws"
          ? {
              ...syntheticLegislation,
              dataset,
              citation_en: `${dataset} SYNTHETIC 1`,
            }
          : {
              ...syntheticDecision,
              dataset,
              citation_en: `2026 ${dataset} 1`,
            };
      return { results: [source, source], total: 2 };
    },
    fetchByCitation: async () => syntheticDecision,
  } as unknown as A2ajClient;
  const provider = new A2ajProvider(client);

  const catalogue = await provider.catalogue();
  assert.equal(catalogue.datasetCount, 48);
  assert.equal(catalogue.decisionDatasetCount, 26);
  assert.equal(catalogue.lawDatasetCount, 22);
  assert.deepEqual(coverageRequests.sort(), ["cases", "laws"]);
  assert.ok(catalogue.warnings.every((warning) => warning.length > 20));
  assert.equal(
    catalogue.datasets.find((row) => row.dataset === "BCCA")?.jurisdiction,
    "CA-BC",
  );
  assert.equal(
    catalogue.datasets.find((row) => row.dataset === "REGULATIONS-SK")
      ?.materialType,
    "regulation",
  );

  for (const dataset of decisionDatasets) {
    const page = await provider.searchDecisionPage({
      query: "synthetic",
      court: dataset,
      limit: 2,
    });
    assert.equal(page.results.length, 1);
    assert.equal(page.duplicateCount, 1);
  }
  for (const dataset of lawDatasets) {
    const page = await provider.searchLegislationPage({
      query: "synthetic",
      dataset,
      limit: 2,
    });
    assert.equal(page.results.length, 1);
    assert.equal(page.duplicateCount, 1);
  }
  assert.deepEqual(
    [...requested].sort(),
    [...decisionDatasets, ...lawDatasets].sort(),
  );
});

test("A2AJ pagination returns a continuation offset without dropping the buffered result", async () => {
  const rows = [1, 2, 3, 4].map((number) => ({
    ...syntheticDecision,
    citation_en: `2026 ONCA ${number}`,
  }));
  const offsets: number[] = [];
  const client = {
    coverage: async () => [{ dataset: "ONCA", count: rows.length }],
    search: async (input: { offset?: number; size?: number }) => {
      const offset = input.offset ?? 0;
      offsets.push(offset);
      return {
        results: rows.slice(offset, offset + (input.size ?? 10)),
        total: rows.length,
      };
    },
  } as unknown as A2ajClient;
  const provider = new A2ajProvider(client);
  const first = await provider.searchDecisionPage({
    query: "synthetic",
    court: "ONCA",
    limit: 2,
  });
  const second = await provider.searchDecisionPage({
    query: "synthetic",
    court: "ONCA",
    limit: 2,
    offset: first.nextOffset ?? 0,
  });
  assert.equal(first.nextOffset, 2);
  assert.deepEqual(
    [...first.results, ...second.results].map((row) => row.sourceId),
    rows.map((row) => row.citation_en),
  );
  assert.deepEqual(offsets, [0, 2]);
});
