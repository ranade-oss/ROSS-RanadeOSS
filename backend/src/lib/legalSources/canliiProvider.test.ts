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
  {
    databaseId: "onca",
    jurisdiction: "on",
    name: "Court of Appeal for Ontario",
  },
  {
    databaseId: "csc-scc",
    jurisdiction: "ca",
    name: "Supreme Court of Canada",
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

test("CanLII client respects Retry-After and retries a 429 once", async () => {
  const delays: number[] = [];
  let calls = 0;
  const client = new CanLiiClient("SYNTHETIC-USER-KEY", {
    maxRetries: 1,
    sleep: async (milliseconds) => void delays.push(milliseconds),
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("rate limited", {
            status: 429,
            headers: { "Retry-After": "2" },
          })
        : Response.json({ caseDatabases: databases });
    },
  });

  assert.equal((await client.listCaseDatabases()).length, databases.length);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2_000]);
});

test("CanLII client exposes an exhausted 429 without claiming retrieval", async () => {
  const client = new CanLiiClient("SYNTHETIC-USER-KEY", {
    maxRetries: 0,
    fetchImpl: async () =>
      new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "7" },
      }),
  });

  await assert.rejects(client.listCaseDatabases(), (error: unknown) => {
    assert.equal((error as { status?: number }).status, 429);
    assert.equal(
      (error as { retryAfterSeconds?: number }).retryAfterSeconds,
      7,
    );
    assert.match((error as Error).message, /Retry after 7 seconds/);
    return true;
  });
});

test("CanLII client does not retry before a long Retry-After window", async () => {
  let calls = 0;
  const client = new CanLiiClient("SYNTHETIC-USER-KEY", {
    maxRetries: 1,
    sleep: async () => {
      throw new Error("A long provider cooldown must not be shortened.");
    },
    fetchImpl: async () => {
      calls += 1;
      return new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "30" },
      });
    },
  });

  await assert.rejects(client.listCaseDatabases(), /Retry after 30 seconds/);
  assert.equal(calls, 1);
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

test("CanLII can browse metadata for sample cases without full-text keyword search", async () => {
  const listed = [
    {
      databaseId: "csc-scc",
      caseId: "2016scc27",
      title: "R. v. Jordan",
      citation: "2016 SCC 27",
    },
  ];
  const client = {
    listCaseDatabases: async () => databases,
    listCases: async (input: { databaseId: string }) => {
      assert.equal(input.databaseId, "csc-scc");
      return listed;
    },
    getCase: async () => {
      throw new Error(
        "Browse discovery must not expand every result into another request.",
      );
    },
  } as unknown as CanLiiClient;
  const provider = new CanLiiMetadataProvider(() => client);

  const results = await provider.searchDecisions(
    { query: "some random cases", jurisdiction: "CA", limit: 3 },
    { apiToken: "SYNTHETIC-USER-KEY" },
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].citation, "2016 SCC 27");
  assert.equal(results[0].fullTextStatus, "metadata-only");
});

test("CanLII fetch accepts an A2AJ neutral-citation source id", async () => {
  const requested: string[] = [];
  const client = {
    listCaseDatabases: async () => databases,
    getCase: async (databaseId: string, caseId: string) => {
      requested.push(`${databaseId}/${caseId}`);
      return {
        ...metadata,
        databaseId: "csc-scc",
        caseId: "2016scc27",
        title: "R. v. Jordan",
        citation: "2016 SCC 27",
      };
    },
  } as unknown as CanLiiClient;
  const provider = new CanLiiMetadataProvider(() => client);

  const result = await provider.fetchDecision("2016 SCC 27", {
    apiToken: "SYNTHETIC-USER-KEY",
  });

  assert.equal(result.citation, "2016 SCC 27");
  assert.deepEqual(requested, ["csc-scc/2016scc27"]);
});

test("CanLII direct source-id fetch makes only the selected metadata request", async () => {
  const requested: string[] = [];
  const client = {
    listCaseDatabases: async () => {
      throw new Error(
        "A direct source id must not reload the database catalogue.",
      );
    },
    getCase: async (databaseId: string, caseId: string) => {
      requested.push(`${databaseId}/${caseId}`);
      return metadata;
    },
  } as unknown as CanLiiClient;
  const provider = new CanLiiMetadataProvider(() => client);

  await provider.fetchDecision("onsc/2024onsc123", {
    apiToken: "SYNTHETIC-USER-KEY",
  });
  assert.deepEqual(requested, ["onsc/2024onsc123"]);
});
