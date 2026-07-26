import { readdir, readFile, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const GENERATED_EXTENSIONS = new Set([".css", ".js", ".map"]);

async function filesBelow(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function assertWithin(root, path, description) {
  const offset = relative(root, path);
  if (offset.startsWith(`..${sep}`) || offset === ".." || resolve(path) === resolve(root)) {
    throw new Error(`${description} escapes the generated asset directory: ${path}`);
  }
}

function assetReferences(text, assetNames) {
  const references = new Set();
  for (const name of assetNames) {
    if (text.includes(name)) references.add(name);
  }
  return references;
}

function manifestAssetPaths(manifest) {
  const paths = [];
  for (const entry of Object.values(manifest)) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.file === "string") paths.push(entry.file);
    for (const field of ["assets", "css"]) {
      if (!Array.isArray(entry[field])) continue;
      for (const path of entry[field]) {
        if (typeof path === "string") paths.push(path);
      }
    }
  }
  return paths;
}

export async function pruneUnreferencedClientAssets({
  distRoot,
  logger = console,
} = {}) {
  if (!distRoot) throw new Error("distRoot is required");

  const normalizedDistRoot = resolve(distRoot);
  const assetsRoot = resolve(normalizedDistRoot, "client/assets");
  const manifestPath = resolve(normalizedDistRoot, "client/.vite/manifest.json");
  const assetsRootStats = await stat(assetsRoot);
  if (!assetsRootStats.isDirectory()) {
    throw new Error(`Client asset path is not a directory: ${assetsRoot}`);
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const generatedAssets = (await filesBelow(assetsRoot)).filter((path) =>
    GENERATED_EXTENSIONS.has(extname(path)),
  );
  if (generatedAssets.length === 0) {
    throw new Error(`No generated client assets were found in ${assetsRoot}`);
  }

  const assetsByName = new Map();
  for (const path of generatedAssets) {
    const name = basename(path);
    if (assetsByName.has(name)) {
      throw new Error(`Generated client asset names must be unique: ${name}`);
    }
    assetsByName.set(name, path);
  }

  const reachableNames = new Set();
  for (const manifestPathValue of manifestAssetPaths(manifest)) {
    if (!manifestPathValue.startsWith("assets/")) continue;
    const path = resolve(assetsRoot, manifestPathValue.slice("assets/".length));
    assertWithin(assetsRoot, path, "Client manifest path");
    const name = basename(path);
    if (!assetsByName.has(name)) {
      throw new Error(`Client manifest references a missing generated asset: ${manifestPathValue}`);
    }
    reachableNames.add(name);
  }

  const allDistFiles = await filesBelow(normalizedDistRoot);
  const outsideAssetFiles = allDistFiles.filter(
    (path) => !path.startsWith(`${assetsRoot}${sep}`),
  );
  for (const path of outsideAssetFiles) {
    const content = await readFile(path, "utf8");
    for (const name of assetReferences(content, assetsByName.keys())) {
      reachableNames.add(name);
    }
  }

  const pending = [...reachableNames];
  while (pending.length > 0) {
    const name = pending.pop();
    const path = assetsByName.get(name);
    if (!path) continue;
    const content = await readFile(path, "utf8");
    for (const referencedName of assetReferences(content, assetsByName.keys())) {
      if (reachableNames.has(referencedName)) continue;
      reachableNames.add(referencedName);
      pending.push(referencedName);
    }
  }

  const removable = generatedAssets.filter(
    (path) => !reachableNames.has(basename(path)),
  );
  const remainingJavaScript = generatedAssets.filter(
    (path) => extname(path) === ".js" && !removable.includes(path),
  );
  if (remainingJavaScript.length === 0) {
    throw new Error("Asset pruning would remove every generated client JavaScript file");
  }

  let removedBytes = 0;
  for (const path of removable) {
    assertWithin(assetsRoot, path, "Removal target");
    removedBytes += (await stat(path)).size;
    await rm(path);
  }

  logger.log(
    `Pruned ${removable.length} unreferenced client asset(s) (${removedBytes} bytes); ` +
      `${generatedAssets.length - removable.length} generated asset(s) remain.`,
  );
  return {
    kept: generatedAssets.length - removable.length,
    removed: removable.length,
    removedBytes,
  };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const scriptDirectory = dirname(currentFile);
  await pruneUnreferencedClientAssets({
    distRoot: resolve(scriptDirectory, "../dist"),
  });
}
