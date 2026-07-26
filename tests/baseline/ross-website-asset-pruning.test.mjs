import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { pruneUnreferencedClientAssets } from "../../website/scripts/prune-unreferenced-client-assets.mjs";

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "ross-asset-pruning-"));
  const assets = resolve(root, "client/assets");
  await mkdir(resolve(root, "client/.vite"), { recursive: true });
  await mkdir(resolve(root, "server"), { recursive: true });
  await mkdir(assets, { recursive: true });
  await writeFile(
    resolve(root, "client/.vite/manifest.json"),
    JSON.stringify({
      entry: {
        file: "assets/entry-good.js",
        css: ["assets/styles-good.css"],
      },
    }),
  );
  await writeFile(
    resolve(root, "server/index.js"),
    'const entry = "/assets/entry-good.js";',
  );
  await writeFile(
    resolve(assets, "entry-good.js"),
    'import "./dynamic-good.js";',
  );
  await writeFile(resolve(assets, "dynamic-good.js"), "export const ready = true;");
  await writeFile(resolve(assets, "styles-good.css"), "body { color: black; }");
  await writeFile(resolve(assets, "duplicate-orphan.js"), "export const stale = true;");
  return { assets, root };
}

test("website build pruning removes only unreachable generated assets", async () => {
  const { assets, root } = await fixture();
  const messages = [];
  const result = await pruneUnreferencedClientAssets({
    distRoot: root,
    logger: { log: (message) => messages.push(message) },
  });

  assert.deepEqual(result, { kept: 3, removed: 1, removedBytes: 26 });
  assert.equal(await readFile(resolve(assets, "entry-good.js"), "utf8"), 'import "./dynamic-good.js";');
  assert.equal(await readFile(resolve(assets, "dynamic-good.js"), "utf8"), "export const ready = true;");
  assert.equal(await readFile(resolve(assets, "styles-good.css"), "utf8"), "body { color: black; }");
  await assert.rejects(readFile(resolve(assets, "duplicate-orphan.js")), /ENOENT/);
  assert.match(messages.join("\n"), /Pruned 1 unreferenced client asset/);
});

test("website build pruning rejects manifest paths outside the asset directory", async () => {
  const { root } = await fixture();
  await writeFile(
    resolve(root, "client/.vite/manifest.json"),
    JSON.stringify({ entry: { file: "assets/../../server/index.js" } }),
  );

  await assert.rejects(
    pruneUnreferencedClientAssets({ distRoot: root }),
    /escapes the generated asset directory/,
  );
});
