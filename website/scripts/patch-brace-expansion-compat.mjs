#!/usr/bin/env node

import { createRequire } from "node:module";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const lock = JSON.parse(
  readFileSync(resolve(root, "package-lock.json"), "utf8"),
);
const safeVersion = "5.0.9";
const legacyRequire =
  /require\((["'])brace-expansion\1\)(?!\.expand)/g;
const legacyImport =
  /import\s+([A-Za-z_$][\w$]*)\s+from\s+(["'])brace-expansion\2/g;

function JavaScriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules") continue;
    const path = resolve(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...JavaScriptFiles(path));
    } else if (entry.endsWith(".js")) {
      files.push(path);
    }
  }
  return files;
}

function patchLegacyMinimatch(directory, version) {
  let references = 0;
  let changedFiles = 0;

  for (const path of JavaScriptFiles(directory)) {
    const source = readFileSync(path, "utf8");
    if (!source.includes("brace-expansion")) continue;
    references += 1;

    const patched = source
      .replace(
        legacyRequire,
        (_match, quote) =>
          `require(${quote}brace-expansion${quote}).expand`,
      )
      .replace(
        legacyImport,
        (_match, binding, quote) =>
          `import { expand as ${binding} } from ${quote}brace-expansion${quote}`,
      );

    legacyRequire.lastIndex = 0;
    legacyImport.lastIndex = 0;
    if (legacyRequire.test(patched) || legacyImport.test(patched)) {
      throw new Error(
        `minimatch ${version} still has an incompatible brace-expansion import in ${path}`,
      );
    }
    legacyRequire.lastIndex = 0;
    legacyImport.lastIndex = 0;

    if (patched !== source) {
      writeFileSync(path, patched);
      changedFiles += 1;
    }
  }

  if (references === 0) {
    throw new Error(
      `minimatch ${version} did not contain an auditable brace-expansion import`,
    );
  }
  return changedFiles;
}

function assertApi(module, label) {
  const matcher =
    typeof module === "function" ? module : module.minimatch;
  const braceExpand =
    module.braceExpand ?? matcher?.braceExpand;
  if (typeof matcher !== "function") {
    throw new Error(`${label} does not expose a minimatch function`);
  }
  if (typeof braceExpand !== "function") {
    throw new Error(`${label} does not expose braceExpand`);
  }
  if (!matcher("verified.js", "*.js")) {
    throw new Error(`${label} failed a basic glob match`);
  }
  const expanded = braceExpand("verified-{a,b}.js");
  if (expanded.join(",") !== "verified-a.js,verified-b.js") {
    throw new Error(`${label} failed a basic brace expansion`);
  }
}

const minimatchPackages = Object.entries(lock.packages)
  .filter(([path]) => {
    if (path === "node_modules/minimatch") return true;
    return path.endsWith("/node_modules/minimatch");
  })
  .map(([path, record]) => ({
    directory: resolve(root, path),
    path,
    version: record.version,
  }));

let changedFiles = 0;
let verifiedPackages = 0;
for (const minimatchPackage of minimatchPackages) {
  if (!existsSync(minimatchPackage.directory)) continue;
  const major = Number.parseInt(
    String(minimatchPackage.version).split(".")[0],
    10,
  );
  if (!Number.isInteger(major)) {
    throw new Error(
      `Invalid minimatch version at ${minimatchPackage.path}`,
    );
  }
  if (major < 10) {
    changedFiles += patchLegacyMinimatch(
      minimatchPackage.directory,
      minimatchPackage.version,
    );
  }

  const packageJsonPath = resolve(
    minimatchPackage.directory,
    "package.json",
  );
  const requireFromPackage = createRequire(packageJsonPath);
  const bracePackage = JSON.parse(
    readFileSync(
      requireFromPackage.resolve("brace-expansion/package.json"),
      "utf8",
    ),
  );
  if (bracePackage.version !== safeVersion) {
    throw new Error(
      `${minimatchPackage.path} resolved brace-expansion ${bracePackage.version}; expected ${safeVersion}`,
    );
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  assertApi(requireFromPackage(minimatchPackage.directory), minimatchPackage.path);

  const importPath = packageJson.exports?.["."]?.import?.default;
  if (importPath) {
    const imported = await import(
      `${pathToFileURL(resolve(minimatchPackage.directory, importPath)).href}?ross-compat-check`
    );
    assertApi(imported, `${minimatchPackage.path} ESM`);
  }
  verifiedPackages += 1;
}

if (verifiedPackages === 0) {
  throw new Error("No installed minimatch package was available to verify");
}

console.log(
  `PASS: verified ${verifiedPackages} minimatch packages with brace-expansion ${safeVersion}; patched ${changedFiles} legacy module files.`,
);
