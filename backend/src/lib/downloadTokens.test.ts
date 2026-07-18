import assert from "node:assert/strict";
import test from "node:test";
import { signDownload, verifyDownload } from "./downloadTokens";

const ENV_KEYS = [
    "DOWNLOAD_SIGNING_SECRET",
    "DOWNLOAD_SIGNING_SECRET_PREVIOUS",
    "DOWNLOAD_TOKEN_TTL_SECONDS",
    "DOWNLOAD_TOKEN_NOT_BEFORE",
] as const;

test("download tokens expire, rotate, and support global revocation", () => {
    const original = Object.fromEntries(
        ENV_KEYS.map((key) => [key, process.env[key]]),
    );
    try {
        process.env.DOWNLOAD_SIGNING_SECRET = "old-secret-for-testing";
        process.env.DOWNLOAD_TOKEN_TTL_SECONDS = "60";
        const token = signDownload("documents/user/document/source.pdf", "source.pdf", 1_000);

        assert.deepEqual(verifyDownload(token, 1_059), {
            path: "documents/user/document/source.pdf",
            filename: "source.pdf",
        });
        assert.equal(verifyDownload(token, 1_060), null);

        process.env.DOWNLOAD_SIGNING_SECRET = "new-secret-for-testing";
        assert.equal(verifyDownload(token, 1_059), null);
        process.env.DOWNLOAD_SIGNING_SECRET_PREVIOUS =
            "old-secret-for-testing";
        assert.ok(verifyDownload(token, 1_059));

        process.env.DOWNLOAD_TOKEN_NOT_BEFORE = "1001";
        assert.equal(verifyDownload(token, 1_059), null);
        assert.equal(verifyDownload(`${token}tampered`, 1_001), null);
    } finally {
        for (const key of ENV_KEYS) {
            const value = original[key];
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
