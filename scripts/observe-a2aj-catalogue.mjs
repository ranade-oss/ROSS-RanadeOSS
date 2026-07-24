#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const baseUrl = (
  process.env.A2AJ_API_BASE_URL ?? "https://api.a2aj.ca"
).replace(/\/$/, "");
const outputArg = process.argv.indexOf("--output");
const outputPath = resolve(
  outputArg >= 0
    ? process.argv[outputArg + 1]
    : "artifacts/a2aj-full-catalogue-live.json",
);
const strict = process.argv.includes("--strict");
const warnings = [
  "A2AJ coverage is provider-reported and may contain gaps.",
  "A2AJ text is unofficial and must be checked against the linked source.",
  "This observation records metadata and reachability only; it stores no legal text.",
];

const requestJson = async (path) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ROSS-RanadeOSS-catalogue-observer/1.0",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const coverageRows = (value) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["coverage", "datasets", "results"])
    if (Array.isArray(value[key])) return value[key];
  return [];
};

const datasetCode = (row) =>
  String(row?.dataset ?? row?.code ?? row?.name ?? "")
    .trim()
    .toUpperCase();

const resultRows = (value) =>
  Array.isArray(value?.results)
    ? value.results
    : Array.isArray(value)
      ? value
      : [];

const citationFor = (row) =>
  [row?.citation_en, row?.citation_fr, row?.citation2_en, row?.citation2_fr]
    .find((value) => typeof value === "string" && value.trim())
    ?.trim() ?? null;

async function observeDataset(row) {
  const dataset = datasetCode(row);
  const law = /^(LEGISLATION|REGULATIONS)-/.test(dataset);
  const docType = law ? "laws" : "cases";
  const queries = law ? ["Act", "Regulation", "the"] : ["law", "court", "the"];
  let lastError = "search-returned-no-result";
  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        query,
        doc_type: docType,
        dataset,
        size: "1",
      });
      const search = await requestJson(`/search?${params}`);
      const result = resultRows(search)[0];
      const citation = citationFor(result);
      if (!citation) continue;
      const fetchParams = new URLSearchParams({
        citation,
        doc_type: docType,
      });
      await requestJson(`/fetch?${fetchParams}`);
      return {
        dataset,
        materialType: law
          ? dataset.startsWith("REGULATIONS-")
            ? "regulation"
            : "legislation"
          : "decision",
        status: "healthy",
        searchQuery: query,
        citation,
        documentCount: row?.document_count ?? row?.count ?? row?.rows ?? null,
        firstDocumentDate:
          row?.first_document_date ?? row?.first_date ?? row?.min_date ?? null,
        lastDocumentDate:
          row?.last_document_date ?? row?.last_date ?? row?.max_date ?? null,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "request-failed";
    }
  }
  return {
    dataset,
    materialType: law
      ? dataset.startsWith("REGULATIONS-")
        ? "regulation"
        : "legislation"
      : "decision",
    status: "degraded",
    reason: lastError,
    documentCount: row?.document_count ?? row?.count ?? row?.rows ?? null,
    firstDocumentDate:
      row?.first_document_date ?? row?.first_date ?? row?.min_date ?? null,
    lastDocumentDate:
      row?.last_document_date ?? row?.last_date ?? row?.max_date ?? null,
  };
}

async function mapWithConcurrency(values, concurrency, task) {
  const results = new Array(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        results[index] = await task(values[index]);
      }
    }),
  );
  return results;
}

let report;
try {
  const raw = await requestJson("/coverage");
  const rows = coverageRows(raw);
  const unique = new Map();
  for (const row of rows) {
    const dataset = datasetCode(row);
    if (/^[A-Z0-9-]{2,100}$/.test(dataset) && !unique.has(dataset))
      unique.set(dataset, row);
  }
  if (!unique.size) throw new Error("A2AJ returned no valid datasets.");
  const datasets = await mapWithConcurrency(
    [...unique.values()],
    4,
    observeDataset,
  );
  report = {
    version: 1,
    checkedAt: new Date().toISOString(),
    endpoint: baseUrl,
    status: datasets.every((item) => item.status === "healthy")
      ? "healthy"
      : "degraded",
    datasetCount: datasets.length,
    healthyCount: datasets.filter((item) => item.status === "healthy").length,
    degradedCount: datasets.filter((item) => item.status === "degraded").length,
    warnings,
    datasets,
  };
} catch (error) {
  report = {
    version: 1,
    checkedAt: new Date().toISOString(),
    endpoint: baseUrl,
    status: "unavailable",
    datasetCount: 0,
    healthyCount: 0,
    degradedCount: 0,
    warnings,
    error: error instanceof Error ? error.message : "A2AJ observation failed.",
    datasets: [],
  };
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `${report.status.toUpperCase()}: observed ${report.datasetCount} A2AJ datasets (${report.healthyCount} healthy, ${report.degradedCount} degraded).`,
);
if (strict && report.status !== "healthy") process.exitCode = 1;
