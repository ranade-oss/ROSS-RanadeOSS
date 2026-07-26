const REQUIRED_TARGETS = [
  {
    id: "a2aj-canada",
    url: "https://api.a2aj.ca/coverage",
    kind: "a2aj-split-coverage",
  },
  {
    id: "ontario-elaws",
    url: "https://www.ontario.ca/laws/statute/90c43",
    kind: "nonempty-text",
  },
  {
    id: "justice-laws-canada",
    url: "https://raw.githubusercontent.com/justicecanada/laws-lois-xml/main/eng/acts/D-3.4.xml",
    kind: "justice-xml",
  },
];

const latencyClass = (milliseconds) =>
  milliseconds < 1_000 ? "fast" : milliseconds < 5_000 ? "standard" : "slow";

const responseVersion = (response, fallback) =>
  response.headers.get("etag") ??
  response.headers.get("last-modified") ??
  fallback;

const a2ajRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["coverage", "datasets", "results"])
    if (Array.isArray(payload[key])) return payload[key];
  return [];
};

const reasonCode = (error) => {
  if (error?.name === "TimeoutError") return "timeout";
  const status = Number(error?.status);
  if (Number.isInteger(status)) return `http-${status}`;
  if (error?.code === "missing-ontario-dataset")
    return "coverage-missing-required-ontario-dataset";
  if (error?.code === "invalid-payload") return "invalid-response";
  return "network-or-validation-failure";
};

const requestHeaders = (target) => ({
  Accept:
    target.kind === "a2aj-split-coverage"
      ? "application/json"
      : "text/html, application/xml, text/xml",
  "User-Agent": "ROSS-RanadeOSS-source-observer/1.0",
});

async function fetchResponse(fetchImpl, url, target, timeoutMs) {
  return fetchImpl(url, {
    headers: requestHeaders(target),
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function inspect(response, target) {
  if (!response.ok) {
    const error = new Error("Legal source returned a non-success status.");
    error.status = response.status;
    throw error;
  }

  const body = await response.text();
  if (body.trim().length < 500) {
    const error = new Error("Legal source response was unexpectedly small.");
    error.code = "invalid-payload";
    throw error;
  }
  if (target.kind === "justice-xml" && !/<(?:Statute|Regulation)\b/.test(body)) {
    const error = new Error("Justice Laws response was not legislation XML.");
    error.code = "invalid-payload";
    throw error;
  }
  return `content-${body.length}-bytes`;
}

async function inspectA2ajCoverage(fetchImpl, target, timeoutMs) {
  const groups = await Promise.all(
    [
      { docType: "cases", requiredDatasets: ["ONCA"] },
      {
        docType: "laws",
        requiredDatasets: ["LEGISLATION-ON", "REGULATIONS-ON"],
      },
    ].map(async ({ docType, requiredDatasets }) => {
      const params = new URLSearchParams({ doc_type: docType });
      const response = await fetchResponse(
        fetchImpl,
        `${target.url}?${params}`,
        target,
        timeoutMs,
      );
      if (!response.ok) {
        const error = new Error("Legal source returned a non-success status.");
        error.status = response.status;
        throw error;
      }
      const rows = a2ajRows(await response.json());
      if (!rows.length) {
        const error = new Error(`A2AJ ${docType} coverage was empty.`);
        error.code = "invalid-payload";
        throw error;
      }
      const datasets = new Set(
        rows
          .map((row) =>
            String(row?.dataset ?? row?.id ?? row?.code ?? "").toUpperCase(),
          )
          .filter(Boolean),
      );
      if (requiredDatasets.some((dataset) => !datasets.has(dataset))) {
        const error = new Error(
          `A2AJ ${docType} coverage omitted required Ontario datasets.`,
        );
        error.code = "missing-ontario-dataset";
        throw error;
      }
      return { docType, rows, response };
    }),
  );
  const cases = groups.find((group) => group.docType === "cases");
  const laws = groups.find((group) => group.docType === "laws");
  const versions = groups
    .map((group) => responseVersion(group.response, null))
    .filter(Boolean);
  return {
    sourceVersion:
      versions.length === groups.length
        ? versions.join("|")
        : `coverage-${cases.rows.length}-cases-${laws.rows.length}-laws`,
  };
}

export async function observeLiveLegalSources({
  fetchImpl = fetch,
  now = () => new Date(),
  clock = () => Date.now(),
  timeoutMs = 10_000,
} = {}) {
  const observedAt = now().toISOString();
  const providers = {};

  for (const target of REQUIRED_TARGETS) {
    const startedAt = clock();
    try {
      const observation =
        target.kind === "a2aj-split-coverage"
          ? await inspectA2ajCoverage(fetchImpl, target, timeoutMs)
          : await (async () => {
              const response = await fetchResponse(
                fetchImpl,
                target.url,
                target,
                timeoutMs,
              );
              const fallbackVersion = await inspect(response, target);
              return {
                sourceVersion: responseVersion(response, fallbackVersion),
              };
            })();
      providers[target.id] = {
        state: "healthy",
        checkedAt: observedAt,
        lastSuccessfulAt: observedAt,
        consecutiveFailures: 0,
        consecutiveSuccesses: 1,
        sourceVersion: observation.sourceVersion,
        latencyClass: latencyClass(Math.max(0, clock() - startedAt)),
        reasonCode: "ok",
      };
    } catch (error) {
      providers[target.id] = {
        state: "degraded",
        checkedAt: observedAt,
        lastSuccessfulAt: null,
        consecutiveFailures: 1,
        consecutiveSuccesses: 0,
        sourceVersion: null,
        latencyClass: latencyClass(Math.max(0, clock() - startedAt)),
        reasonCode: reasonCode(error),
      };
    }
  }

  providers["courtlistener-us"] = {
    state: "not-observed",
    checkedAt: null,
    lastSuccessfulAt: null,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    sourceVersion: null,
    latencyClass: null,
    reasonCode: "optional-credential-not-used",
  };
  providers["canlii-licensed"] = {
    state: "disabled",
    checkedAt: null,
    lastSuccessfulAt: null,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    sourceVersion: null,
    latencyClass: null,
    reasonCode: "licensed-connector-disabled",
  };

  const requiredHealthy = REQUIRED_TARGETS.every(
    ({ id }) => providers[id]?.state === "healthy",
  );
  return {
    version: "1.0.0",
    observedAt,
    liveChecksPerformed: true,
    status: requiredHealthy ? "healthy" : "degraded",
    providers,
  };
}

export const requiredLiveProviderIds = REQUIRED_TARGETS.map(({ id }) => id);
