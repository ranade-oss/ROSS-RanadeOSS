import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function getWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "test",
    `${process.pid}-${Date.now()}-${Math.random()}`,
  );
  return (await import(workerUrl.href)).default;
}

async function render(path) {
  const worker = await getWorker();
  const response = await worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  return { response, html: await response.text() };
}

test("landing page renders the accurate beta and source boundary", async () => {
  const { response, html } = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /Ontario-first legal work/);
  assert.match(html, /synthetic or non-confidential materials only/i);
  assert.match(
    html,
    /live availability and comprehensive Ontario coverage are not verified/i,
  );
  assert.match(html, /href="\/coverage"/);
  assert.match(
    html,
    /href="https:\/\/github\.com\/ranade-oss\/ROSS-RanadeOSS"/,
  );
});

test("required public routes render without authentication", async () => {
  const routes = [
    "/ontario",
    "/features",
    "/workflows",
    "/workflows/civil-claim-defence-issue-extraction",
    "/open-source",
    "/security",
    "/privacy",
    "/terms",
    "/acceptable-use",
    "/accessibility",
    "/contact",
    "/about",
    "/docs",
    "/updates",
    "/updates/foundation",
    "/coverage",
    "/status",
    "/subprocessors",
    "/responsible-ai",
    "/demo",
    "/readiness",
  ];

  for (const route of routes) {
    const { response, html } = await render(route);
    const normalized = html.replaceAll("<!-- -->", "");
    assert.equal(response.status, 200, route);
    assert.match(html, /Skip to main content/, route);
    assert.match(normalized, /Operator: Abhi Ranade/, route);
    assert.match(html, /Modified from/, route);
    assert.match(normalized, /Next review<\/dt><dd>2026-08-16/, route);
  }
});

test("Ontario workflow catalogue exposes governed approvals and app deep links", async () => {
  const catalogue = await render("/workflows");
  assert.match(catalogue.html, /five versioned Ontario workflows are approved/i);
  assert.match(catalogue.html, /Ontario Documentary Discovery Review/);
  const entry = await render("/workflows/factum-authority-record-cross-check");
  assert.equal(entry.response.status, 200);
  assert.match(entry.html, /Ontario-lawyer reviewed and approved/i);
  assert.match(
    entry.html,
    /builtin-ross-ontario-factum-authority-record-cross-check/,
  );
  assert.match(
    entry.html,
    /Citation and passage verification remain separate/i,
  );
});

test("coverage is generated from implemented provider boundaries without claiming live completeness", async () => {
  const { response, html } = await render("/coverage");
  assert.equal(response.status, 200);
  assert.match(html, /Sanitized public legal-source registry/);
  assert.match(html, /A2AJ Canadian legal data/);
  assert.match(html, /Ontario e-Laws/);
  assert.match(html, /Justice Laws Canada/);
  assert.match(html, /CourtListener/);
  assert.match(html, /Per-user encrypted key storage is implemented/);
  assert.match(html, /does not establish live provider health/i);
  assert.doesNotMatch(html, /CANLII_API_KEY|COURTLISTENER_API_TOKEN/);
});

test("the product demonstration is fictional, captioned, and text-equivalent", async () => {
  const { response, html } = await render("/demo");
  assert.equal(response.status, 200);
  assert.match(html, /Northstar Components — synthetic matter/);
  assert.match(html, /Fictional demonstration only/);
  assert.match(html, /No real authority, party, matter, or client information/);
  assert.match(html, /Transcript/);
  assert.match(html, /Treatment unavailable/);
});

test("legal notices are effective with dated owner and independent governance", async () => {
  for (const route of ["/terms", "/acceptable-use"]) {
    const { response, html } = await render(route);
    assert.equal(response.status, 200, route);
    assert.match(html, /owner-approved/, route);
    assert.match(html, /Effective<\/dt><dd>2026-07-18/, route);
    assert.match(html, /Abhi Ranade/, route);
    assert.doesNotMatch(html, /title>[^<]*placeholder/i, route);
  }
  const privacy = await render("/privacy");
  assert.equal(privacy.response.status, 200);
  assert.match(privacy.html, /independent-reviewed/);
  assert.match(privacy.html, /Independent privacy expert/);
  assert.match(privacy.html, /Effective<\/dt><dd>2026-07-18/);
});

test("the first dated update and governed metadata render", async () => {
  const catalogue = await render("/updates");
  assert.match(catalogue.html, /Ontario product foundation and trust gates/);
  const update = await render("/updates/foundation");
  const normalized = update.html.replaceAll("<!-- -->", "");
  assert.equal(update.response.status, 200);
  assert.match(normalized, /Published 2026-07-16/);
  assert.match(update.html, /What remains blocked/);
  assert.match(update.html, /effective notices, and operational exercises are recorded/);
});

test("production readiness records completed gates while indexing still fails closed before promotion", async () => {
  const readiness = await render("/readiness");
  assert.equal(readiness.response.status, 200);
  assert.match(readiness.html, /completed live-environment exercises/i);
  assert.match(readiness.html, /Ready for immutable-candidate generation/i);
  assert.match(
    readiness.html,
    /No confidential or privileged client-material launch/i,
  );
  const update = await render("/updates/release-controls");
  assert.equal(update.response.status, 200);
  assert.match(update.html, /operational and launch gates completed/i);
  const robots = await render("/robots.txt");
  assert.match(robots.html, /Disallow: \/$/m);
});

test("unknown routes return the custom not-found page", async () => {
  const { response, html } = await render("/not-a-real-ross-page");
  assert.equal(response.status, 404);
  assert.match(html, /not in the source map/i);
});
