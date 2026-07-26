import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");

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
const lawDatasets = [
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
].flatMap((code) => [`LEGISLATION-${code}`, `REGULATIONS-${code}`]);

test("the catalogue observer merges the split live coverage contract", async () => {
  const coverageRequests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/coverage") {
      const docType = url.searchParams.get("doc_type");
      coverageRequests.push(docType);
      const datasets = docType === "laws" ? lawDatasets : decisionDatasets;
      response.end(
        JSON.stringify({
          coverage: datasets.map((dataset) => ({
            dataset,
            count: 1,
            first_date: "2000-01-01",
            last_date: "2026-07-25",
          })),
        }),
      );
      return;
    }
    if (url.pathname === "/search") {
      const dataset = url.searchParams.get("dataset");
      const law = url.searchParams.get("doc_type") === "laws";
      response.end(
        JSON.stringify({
          results: [
            {
              dataset,
              citation_en: law
                ? `${dataset} SYNTHETIC 1`
                : `2026 ${dataset} 1`,
            },
          ],
        }),
      );
      return;
    }
    if (url.pathname === "/fetch") {
      response.end(JSON.stringify({ result: { dataset: "SYNTHETIC" } }));
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  const directory = await mkdtemp(join(tmpdir(), "ross-a2aj-observer-"));
  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    const output = join(directory, "catalogue.json");
    await execFileAsync(
      process.execPath,
      [
        resolve(root, "scripts/observe-a2aj-catalogue.mjs"),
        "--output",
        output,
        "--strict",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          A2AJ_API_BASE_URL: `http://127.0.0.1:${address.port}`,
        },
      },
    );
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.status, "healthy");
    assert.equal(report.datasetCount, 48);
    assert.equal(report.decisionDatasetCount, 26);
    assert.equal(report.lawDatasetCount, 22);
    assert.deepEqual(coverageRequests.sort(), ["cases", "laws"]);
    assert.doesNotMatch(JSON.stringify(report), /unofficial_text/);
  } finally {
    await new Promise((resolveClose, rejectClose) =>
      server.close((error) =>
        error ? rejectClose(error) : resolveClose(),
      ),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
