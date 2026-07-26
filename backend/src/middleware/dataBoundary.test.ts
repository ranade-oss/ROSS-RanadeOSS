import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
    ROSS_DATA_BOUNDARY_HEADER,
    ROSS_DATA_BOUNDARY_VALUE,
    enforceHostedDataBoundary,
    isContentBearingRequest,
} from "./dataBoundary";
import type { RuntimeConfig } from "../config/runtime";
import { requireAuth } from "./auth";

const config: RuntimeConfig = {
    environment: "test",
    port: 3001,
    allowedOrigins: ["http://localhost:3000"],
    hostedMode: "controlled-beta",
    dataBoundaryVersion: "test-v1",
    hostedModelProviders: ["openai"],
    releaseId: null,
    releaseManifestSha256: null,
};

test("content-bearing write routes are identified without blocking reads or deletion", () => {
    assert.equal(isContentBearingRequest("POST", "/chat"), true);
    assert.equal(
        isContentBearingRequest("PUT", "/single-documents/id/versions/v/file"),
        true,
    );
    assert.equal(isContentBearingRequest("GET", "/chat"), false);
    assert.equal(isContentBearingRequest("DELETE", "/projects/id"), false);
    assert.equal(
        isContentBearingRequest("POST", "/legal-sources/citations/verify"),
        false,
    );
});

test("controlled beta rejects content without the exact acknowledgement", () => {
    let status = 0;
    let body: unknown;
    let nextCalled = false;
    const middleware = enforceHostedDataBoundary(config);
    middleware(
        {
            method: "POST",
            originalUrl: "/chat",
            path: "/chat",
            header: () => undefined,
        } as never,
        {
            status(code: number) {
                status = code;
                return this;
            },
            json(value: unknown) {
                body = value;
                return this;
            },
            setHeader() {},
        } as never,
        () => {
            nextCalled = true;
        },
    );
    assert.equal(status, 428);
    assert.equal(nextCalled, false);
    assert.match(
        JSON.stringify(body),
        /synthetic or affirmatively non-confidential/,
    );
});

test("controlled beta accepts the exact acknowledgement and self-hosted mode is unchanged", () => {
    let betaNext = false;
    enforceHostedDataBoundary(config)(
        {
            method: "POST",
            originalUrl: "/projects/id/documents",
            path: "/projects/id/documents",
            header: () => "synthetic-or-non-confidential",
        } as never,
        { setHeader() {} } as never,
        () => {
            betaNext = true;
        },
    );
    assert.equal(betaNext, true);

    let selfHostedNext = false;
    enforceHostedDataBoundary({ ...config, hostedMode: "self-hosted" })(
        {
            method: "POST",
            originalUrl: "/chat",
            path: "/chat",
            header: () => undefined,
        } as never,
        {} as never,
        () => {
            selfHostedNext = true;
        },
    );
    assert.equal(selfHostedNext, true);
});

test("a boundary-aware upload probe reaches authentication without writing data", async () => {
    const app = express();
    app.use(enforceHostedDataBoundary(config));
    app.post("/single-documents", requireAuth, (_req, res) => {
        res.status(500).json({
            detail: "The unauthenticated probe reached a write handler.",
        });
    });

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    try {
        const url = `http://127.0.0.1:${address.port}/single-documents`;
        const blocked = await fetch(url, { method: "POST" });
        assert.equal(blocked.status, 428);

        const authenticatedBoundary = await fetch(url, {
            method: "POST",
            headers: {
                [ROSS_DATA_BOUNDARY_HEADER]: ROSS_DATA_BOUNDARY_VALUE,
                "Content-Type": "application/octet-stream",
            },
            body: new Uint8Array(),
        });
        assert.equal(authenticatedBoundary.status, 401);
        assert.deepEqual(await authenticatedBoundary.json(), {
            detail: "Missing or invalid Authorization header",
        });
    } finally {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    }
});
