import assert from "node:assert/strict";
import test from "node:test";
import { CanLiiClient, buildCanLiiSearchUrl } from "./canliiClient";
import { CanLiiMetadataProvider } from "./canliiProvider";

const databases = [
  {
    databaseId: "onsc",
    jurisdiction: "on",
    name: "Ontario Superior Court of Justice",
  },
];

const metadata = {
  databaseId: "onsc",
  caseId: "2024onsc123",
  url: "https://canlii.ca/t/synthetic",
  title: "Synthetic Applicant v. Synthetic Respondent",
  citation: "2024 ONSC 123 (CanLII)",
  language: "en",
  docketNumber: "CV-SYNTHETIC",
  decisionDate: "2024-02-01",
  keywords: "defamation — synthetic",
  concatenatedId: "2024onsc123",
};

test("CanLII client uses only the documented HTTPS metadata and citator endpoints", async () => {
  const urls: string[] = [];
  const client = new CanLiiClient("SYNTHETIC-USER-KEY", {
    fetchImpl: async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/caseCitator/"))
        return Response.json({ citingCases: [] });
      if (url.endsWith("/caseBrowse/en/?api_key=SYNTHETIC-USER-KEY"))
        return Response.json({ caseDatabases: databases });
      return Response.json(metadata);
    },
  });
  await client.listCaseDatabases();
  await client.getCase("onsc", "2024onsc123");
  await client.getCitator("onsc", "2024onsc123", "citingCases");
  assert.ok(urls.every((url) => url.startsWith("https://api.canlii.org/v1/")));
  assert.ok(urls.every((url) => url.includes("api_key=SYNTHETIC-USER-KEY")));
  assert.ok(urls.some((url) => url.includes("/caseCitator/en/onsc/")));
});

test("CanLII provider activates with a user key for metadata, citation, and citator operations", async () => {
  const calls: string[] = [];
  const client = {
    listCaseDatabases: async () => databases,
    listCases: async () => [],
    getCase: async () => {
      calls.push("metadata");
      return metadata;
    },
    getCitator: async () => {
      calls.push("citator");
      return { citingCases: [] };
    },
  } as unknown as CanLiiClient;
  const provider = new CanLiiMetadataProvider((apiKey) => {
    assert.equal(apiKey, "SYNTHETIC-USER-KEY");
    return client;
  });
  const context = { apiToken: "SYNTHETIC-USER-KEY" };

  assert.equal((await provider.health(context)).ok, true);
  const results = await provider.searchDecisions(
    { query: "2024 ONSC 123", court: "onsc" },
    context,
  );
  assert.equal(results[0].citation, "2024 ONSC 123 (CanLII)");
  assert.equal(results[0].fullTextStatus, "metadata-only");
  assert.equal(results[0].jurisdiction, "CA-ON");
  const verified = await provider.verifyCitations(["2024 ONSC 123"], context);
  assert.equal(verified[0].status, "verified");
  await provider.citator("onsc", "2024onsc123", "citingCases", context);
  assert.deepEqual(calls, ["metadata", "metadata", "citator"]);
});

test("CanLII topical search remains a user-directed link rather than website crawling", async () => {
  const provider = new CanLiiMetadataProvider(() => {
    throw new Error("The API must not be called to build a search link.");
  });
  const url = provider.searchUrl({
    query: "defamation",
    databaseId: "onsc",
    jurisdiction: "ON",
  });
  assert.equal(
    url,
    buildCanLiiSearchUrl({
      query: "defamation",
      databaseId: "onsc",
      jurisdiction: "ON",
    }),
  );
  assert.match(url, /^https:\/\/www\.canlii\.org\/en\/on\/onsc\//);
  assert.match(url, /text=defamation/);
});
