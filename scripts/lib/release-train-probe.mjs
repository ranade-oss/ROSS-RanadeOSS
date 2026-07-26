export const deployedReleaseTrainProbe = `
const [
  apiNetwork,
  webNetwork,
  workerNetwork,
  publicApi,
  publicWeb,
  expectedEnvironment,
  expectedRelease,
  expectedSignups,
  full
] = process.argv.slice(1);
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const describeError = (error) => {
  const parts = [
    error instanceof Error ? error.message : String(error),
    error?.cause?.code,
    error?.cause?.message,
  ].filter(Boolean);
  return [...new Set(parts)].join(": ");
};
const retryableStatus = new Set([408, 425, 429, 500, 502, 503, 504]);
const request = async (label, url, options = {}) => {
  let lastError = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10000),
      });
      if (!retryableStatus.has(response.status) || attempt === 12) {
        return response;
      }
      lastError = new Error("HTTP " + response.status);
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
    }
    if (attempt < 12) await wait(5000);
  }
  throw new Error(
    label + " could not reach " + url + " after 12 attempts: " +
      describeError(lastError),
  );
};
const json = async (response, label) => {
  expect(response.ok, label + " returned HTTP " + response.status);
  return response.json();
};
const expectStatus = async (response, expected, label) => {
  if (response.status === expected) return;
  let detail = "";
  try {
    detail = (await response.text()).trim().slice(0, 500);
  } catch {}
  throw new Error(
    label + " expected HTTP " + expected + " but received HTTP " +
      response.status + (detail ? ": " + detail : ""),
  );
};
(async () => {
  const health = await json(
    await request("API health", apiNetwork + "/health"),
    "API health",
  );
  expect(health.ok === true && health.service === "ross-api", "API health contract failed");
  const login = await request("Web login", webNetwork + "/login", {
    redirect: "manual",
  });
  expect(login.status >= 200 && login.status < 400, "Web login route failed");
  const workerHealth = await json(
    await request("Worker health", workerNetwork + "/health"),
    "Worker health",
  );
  expect(
    workerHealth.ok === true && workerHealth.service === "ross-file-worker",
    "Worker health contract failed",
  );
  if (full !== "true") return;
  expect(health.releaseId === expectedRelease, "API release identity mismatch");

  const runtime = await json(
    await request(
      "Web runtime configuration",
      webNetwork + "/api/runtime-config",
    ),
    "Web runtime configuration",
  );
  expect(runtime.apiBaseUrl === publicApi, "Runtime API origin mismatch");
  expect(runtime.appUrl === publicWeb, "Runtime app origin mismatch");
  expect(runtime.environment === expectedEnvironment, "Runtime environment mismatch");
  expect(runtime.releaseId === expectedRelease, "Web release identity mismatch");
  expect(
    runtime.signupsEnabled === (expectedSignups === "true"),
    "Runtime signup policy mismatch",
  );

  const allowed = await request(
    "Allowed CORS origin",
    apiNetwork + "/health",
    { headers: { Origin: publicWeb } },
  );
  expect(allowed.ok, "Allowed CORS origin failed");
  expect(
    allowed.headers.get("access-control-allow-origin") === publicWeb,
    "Allowed CORS origin was not echoed",
  );
  const denied = await request(
    "Denied CORS origin",
    apiNetwork + "/health",
    { headers: { Origin: "https://untrusted.example" } },
  );
  expect(denied.status === 403, "Untrusted CORS origin was not denied");

  const protectedRead = await request(
    "Protected document read",
    apiNetwork + "/single-documents",
    { headers: { Origin: publicWeb } },
  );
  await expectStatus(protectedRead, 401, "Authentication guard");
  const protectedUpload = await request(
    "Protected document upload",
    apiNetwork + "/single-documents",
    {
      method: "POST",
      headers: {
        Origin: publicWeb,
        "Content-Type": "application/octet-stream",
        "X-ROSS-Data-Boundary": "synthetic-or-non-confidential",
      },
      body: new Uint8Array(),
    },
  );
  await expectStatus(protectedUpload, 401, "Upload authentication guard");

  const settings = await request(
    "Supabase settings",
    process.env.SUPABASE_URL.replace(/\\/$/, "") + "/auth/v1/settings",
    { headers: { apikey: process.env.SUPABASE_SECRET_KEY } },
  );
  expect(settings.ok, "Supabase authentication configuration failed");

  const workerAuth = await request(
    "Worker authentication",
    workerNetwork + "/process",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.FILE_WORKER_SHARED_SECRET,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  expect(workerAuth.status === 400, "API-to-worker shared secret wiring failed");
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
`;

