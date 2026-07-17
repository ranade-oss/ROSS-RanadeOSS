const REQUIRED_TARGETS = [
  {
    id: "a2aj-canada",
    url: "https://api.a2aj.ca/coverage",
    kind: "a2aj-coverage",
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

async function inspect(response, target) {
  if (!response.ok) {
    const error = new Error("Legal source returned a non-success status.");
    error.status = response.status;
    throw error;
  }

  if (target.kind === "a2aj-coverage") {
    const rows = a2ajRows(await response.json());
    if (!rows.length) {
      const error = new Error("A2AJ coverage was empty.");
      error.code = "invalid-payload";
      throw error;
    }
    const datasets = new Set(
      rows
        .map((row) => String(row?.dataset ?? row?.id ?? row?.code ?? "").toUpperCase())
        .filter(Boolean),
    );
    const requiredDatasets = ["ONCA", "LEGISLATION-ON", "REGULATIONS-ON"];
    if (requiredDatasets.some((dataset) => !datasets.has(dataset))) {
      const error = new Error("A2AJ did not report required Ontario coverage.");
      error.code = "missing-ontario-dataset";
      throw error;
    }
    return `coverage-${rows.length}-datasets`;
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
      const response = await fetchImpl(target.url, {
        headers: {
          Accept: target.kind === "a2aj-coverage" ? "application/json" : "text/html, application/xml, text/xml",
          "User-Agent": "ROSS-RanadeOSS-source-observer/1.0",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const fallbackVersion = await inspect(response, target);
      providers[target.id] = {
        state: "healthy",
        checkedAt: observedAt,
        lastSuccessfulAt: observedAt,
        consecutiveFailures: 0,
        consecutiveSuccesses: 1,
        sourceVersion: responseVersion(response, fallbackVersion),
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
