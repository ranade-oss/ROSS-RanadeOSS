import { execFileSync } from "node:child_process";

export const RELEASE_ID_PATTERN = /^ross-public-beta-\d{8}-rc[1-9]\d*$/;

export function validateReleaseId(value) {
  const releaseId = String(value ?? "").trim();
  if (!RELEASE_ID_PATTERN.test(releaseId)) {
    throw new Error(
      "Release ID must use ross-public-beta-YYYYMMDD-rcN (for example, ross-public-beta-20260717-rc1).",
    );
  }
  return releaseId;
}

export function verifyImmutableTag(releaseId, options = {}) {
  const run = options.execFileSync ?? execFileSync;
  const cwd = options.cwd ?? process.cwd();
  const tagCommit = String(
    run("git", ["rev-list", "-n", "1", `refs/tags/${releaseId}`], {
      cwd,
      encoding: "utf8",
    }),
  ).trim();
  const headCommit = String(
    run("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }),
  ).trim();
  if (!tagCommit) throw new Error(`Immutable release tag ${releaseId} does not exist.`);
  if (tagCommit !== headCommit) {
    throw new Error(
      `Immutable release tag ${releaseId} points to ${tagCommit}, not checked-out commit ${headCommit}.`,
    );
  }
  return headCommit;
}
