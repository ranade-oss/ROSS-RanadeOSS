import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { corsPolicy, rejectDeniedCorsOrigin } from "./corsPolicy";

type Request = (origin?: string) => Promise<Response>;

async function withServer(run: (request: Request) => Promise<Response>) {
  const app = express();
  app.use(corsPolicy(["https://app.ross.test"]));
  app.use(rejectDeniedCorsOrigin);
  app.get("/health", (_req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    return await run((origin) => {
      const headers = origin ? { Origin: origin } : undefined;
      return fetch(`http://127.0.0.1:${address.port}/health`, {
        headers,
      });
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("CORS policy permits the configured browser origin", async () => {
  const response = await withServer((request) =>
    request("https://app.ross.test"),
  );
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://app.ross.test",
  );
});

test("CORS policy rejects other browser origins with a controlled 403", async () => {
  const response = await withServer((request) =>
    request("https://attacker.example"),
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.deepEqual(await response.json(), {
    detail: "Request origin is not allowed.",
  });
});

test("CORS policy permits non-browser requests without an Origin header", async () => {
  const response = await withServer((request) => request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});
