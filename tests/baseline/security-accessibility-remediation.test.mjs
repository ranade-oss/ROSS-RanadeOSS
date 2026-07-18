import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("the web application emits the required browser security headers", () => {
    const config = read("frontend/next.config.ts");
    assert.match(config, /poweredByHeader:\s*false/);
    for (const header of [
        "Content-Security-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
    ]) {
        assert.match(config, new RegExp(header), header);
    }
    assert.match(config, /frame-ancestors 'none'/);
    assert.match(config, /object-src 'none'/);
});

test("login errors are announced, associated, and programmatically focused", () => {
    const login = read("frontend/src/app/login/page.tsx");
    assert.match(login, /autoComplete="username"/);
    assert.match(login, /autoComplete="current-password"/);
    assert.match(login, /role="alert"/);
    assert.match(login, /aria-live="assertive"/);
    assert.match(login, /aria-describedby=/);
    assert.match(login, /errorRef\.current\?\.focus\(\)/);
    assert.match(login, /focus-visible:ring-blue-700/);
});
