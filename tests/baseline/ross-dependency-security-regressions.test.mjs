import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));

test("every npm workspace resolves the patched brace-expansion release", () => {
  for (const workspace of ["frontend", "website"]) {
    const packageJson = json(`${workspace}/package.json`);
    const lock = json(`${workspace}/package-lock.json`);

    assert.equal(packageJson.overrides["brace-expansion"], "5.0.9");
    assert.equal(
      packageJson.scripts.postinstall,
      "node scripts/patch-brace-expansion-compat.mjs",
    );

    const bracePackages = Object.entries(lock.packages).filter(([path]) => {
      if (path === "node_modules/brace-expansion") return true;
      return path.endsWith("/node_modules/brace-expansion");
    });
    assert.ok(bracePackages.length > 0);
    for (const [path, record] of bracePackages) {
      assert.equal(record.version, "5.0.9", `${workspace}/${path}`);
      assert.doesNotMatch(String(record.resolved), /^file:/);
    }
  }
});

test("legacy minimatch compatibility patching is deterministic and fail closed", () => {
  const frontendPatch = read(
    "frontend/scripts/patch-brace-expansion-compat.mjs",
  );
  const websitePatch = read(
    "website/scripts/patch-brace-expansion-compat.mjs",
  );

  assert.equal(frontendPatch, websitePatch);
  assert.match(frontendPatch, /safeVersion = "5\.0\.9"/);
  assert.match(frontendPatch, /require\\.*brace-expansion/);
  assert.match(frontendPatch, /import\\s\+/);
  assert.match(frontendPatch, /failed a basic glob match/);
  assert.match(frontendPatch, /failed a basic brace expansion/);
  assert.match(frontendPatch, /No installed minimatch package was available/);
});

test("security-sensitive transitive dependencies stay on fixed releases", () => {
  const workspaces = {
    backend: { fastUri: "3.1.5", ipAddress: "10.4.0" },
    frontend: { undici: "7.29.0" },
    website: { fastUri: "3.1.5", undici: "7.29.0" },
  };

  for (const [workspace, expected] of Object.entries(workspaces)) {
    const packageJson = json(`${workspace}/package.json`);
    const lock = json(`${workspace}/package-lock.json`);
    const overrides = packageJson.overrides ?? {};

    for (const [dependency, version] of Object.entries({
      ...(expected.fastUri ? { "fast-uri": expected.fastUri } : {}),
      ...(expected.ipAddress ? { "ip-address": expected.ipAddress } : {}),
      ...(expected.undici ? { undici: expected.undici } : {}),
    })) {
      assert.equal(overrides[dependency], version);
      const resolved = Object.entries(lock.packages).filter(([path]) =>
        path === `node_modules/${dependency}` ||
        path.endsWith(`/node_modules/${dependency}`),
      );
      assert.ok(resolved.length > 0, `${workspace} must lock ${dependency}`);
      for (const [path, record] of resolved)
        assert.equal(record.version, version, `${workspace}/${path}`);
    }
  }
});

test("React server components and Next.js use their current patched releases", () => {
  const frontendPackage = json("frontend/package.json");
  const websitePackage = json("website/package.json");
  const websiteLock = json("website/package-lock.json");

  assert.equal(frontendPackage.dependencies.next, "^16.2.12");
  assert.equal(frontendPackage.dependencies.react, "19.2.8");
  assert.equal(frontendPackage.dependencies["react-dom"], "19.2.8");
  assert.equal(websitePackage.dependencies.next, "16.2.12");
  assert.equal(websitePackage.dependencies.react, "19.2.8");
  assert.equal(websitePackage.dependencies["react-dom"], "19.2.8");
  assert.equal(
    websitePackage.devDependencies["react-server-dom-webpack"],
    "19.2.8",
  );
  assert.equal(
    websiteLock.packages["node_modules/react-server-dom-webpack"].version,
    "19.2.8",
  );
});
