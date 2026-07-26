import { spawn } from "node:child_process";

const workspaces = ["backend", "frontend", "website"];
const npmCli = process.env.npm_execpath;
const defaultMaxAttempts = 6;
const defaultRetryBaseMs = 10_000;
const maxRetryDelayMs = 160_000;

function integerSetting(name, fallback, minimum, maximum) {
  const configured = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isInteger(configured)) return fallback;
  if (configured < minimum) return fallback;
  if (configured > maximum) return fallback;
  return configured;
}

const maxAttempts = integerSetting(
  "ROSS_AUDIT_MAX_ATTEMPTS",
  defaultMaxAttempts,
  1,
  8,
);
const retryBaseMs = integerSetting(
  "ROSS_AUDIT_RETRY_BASE_MS",
  defaultRetryBaseMs,
  0,
  60_000,
);

function runAudit(workspace) {
  return new Promise((resolve) => {
    const args = [
      ...(npmCli ? [npmCli] : []),
      "audit",
      "--json",
      "--package-lock-only",
      "--audit-level=high",
      "--prefix",
      workspace,
    ];
    const command = npmCli
      ? process.execPath
      : process.platform === "win32"
        ? "npm.cmd"
        : "npm";

    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.on("error", (error) => {
      finish({ code: null, error, stderr, stdout });
    });
    child.on("close", (code, signal) => {
      finish({ code, error: null, signal, stderr, stdout });
    });
  });
}

function parseReport(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function isRecord(value) {
  if (value === null) return false;
  return typeof value === "object";
}

function vulnerabilityCounts(report) {
  if (!isRecord(report)) return null;
  if (!isRecord(report.metadata)) return null;
  if (!isRecord(report.metadata.vulnerabilities)) return null;

  const counts = report.metadata.vulnerabilities;
  return {
    critical: Number(counts.critical ?? 0),
    high: Number(counts.high ?? 0),
  };
}

function highPackageNames(report) {
  if (!isRecord(report)) return [];
  if (!isRecord(report.vulnerabilities)) return [];
  return Object.entries(report.vulnerabilities)
    .filter(([, vulnerability]) => {
      if (!isRecord(vulnerability)) return false;
      return ["high", "critical"].includes(vulnerability.severity);
    })
    .map(([name]) => name)
    .sort();
}

function classify(result) {
  if (result.error) {
    return {
      kind: "infrastructure",
      reason: `audit process could not start: ${result.error.message}`,
    };
  }

  const report = parseReport(result.stdout);
  const counts = vulnerabilityCounts(report);
  if (counts) {
    if (counts.high > 0) {
      return { counts, kind: "vulnerable", report };
    }
    if (counts.critical > 0) {
      return { counts, kind: "vulnerable", report };
    }
    if (result.code === 0) {
      return { counts, kind: "passed", report };
    }
  }

  if (isRecord(report)) {
    if (isRecord(report.error)) {
      const code = String(report.error.code ?? "audit-endpoint-error");
      const summary = String(report.error.summary ?? report.error.message ?? "");
      return {
        kind: "infrastructure",
        reason: `${code}${summary ? `: ${summary}` : ""}`,
      };
    }
  }

  const combinedOutput = `${result.stderr}\n${result.stdout}`;
  if (/invalid json response body/i.test(combinedOutput)) {
    return {
      kind: "infrastructure",
      reason: "registry returned a malformed JSON audit response",
    };
  }
  if (/audit endpoint returned an error/i.test(combinedOutput)) {
    return {
      kind: "infrastructure",
      reason: "registry audit endpoint returned an error",
    };
  }
  if (result.signal) {
    return {
      kind: "infrastructure",
      reason: `audit process ended with signal ${result.signal}`,
    };
  }
  return {
    kind: "infrastructure",
    reason: `npm audit exited with code ${result.code ?? "unknown"} without a valid report`,
  };
}

function retryDelay(attempt) {
  return Math.min(retryBaseMs * 2 ** (attempt - 1), maxRetryDelayMs);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const results = new Map(
  workspaces.map((workspace) => [
    workspace,
    { attempts: 0, classification: null, raw: null },
  ]),
);

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const pending = workspaces.filter(
    (workspace) => results.get(workspace).classification === null,
  );
  if (pending.length === 0) break;

  for (const workspace of pending) {
    console.log(
      `\n=== ${workspace} dependency audit (attempt ${attempt}/${maxAttempts}) ===`,
    );
    const raw = await runAudit(workspace);
    const classification = classify(raw);
    const state = results.get(workspace);
    state.attempts = attempt;
    state.raw = raw;

    if (classification.kind === "passed") {
      state.classification = classification;
      console.log(
        `${workspace}: passed with 0 high and 0 critical advisories.`,
      );
      continue;
    }

    if (classification.kind === "vulnerable") {
      state.classification = classification;
      const packages = highPackageNames(classification.report);
      console.error(
        `${workspace}: found ${classification.counts.high} high and ${classification.counts.critical} critical advisories.`,
      );
      if (packages.length > 0) {
        console.error(`${workspace}: affected packages: ${packages.join(", ")}`);
      }
      continue;
    }

    console.warn(
      `${workspace}: audit infrastructure attempt ${attempt}/${maxAttempts} failed: ${classification.reason}.`,
    );
    if (attempt === maxAttempts) {
      state.classification = classification;
    }
  }

  const stillPending = workspaces.filter(
    (workspace) => results.get(workspace).classification === null,
  );
  if (stillPending.length === 0) break;

  const delay = retryDelay(attempt);
  console.warn(
    `Retrying dependency audit for ${stillPending.join(", ")} in ${delay} ms.`,
  );
  await wait(delay);
}

const vulnerable = workspaces.filter(
  (workspace) => results.get(workspace).classification?.kind === "vulnerable",
);
const unavailable = workspaces.filter(
  (workspace) =>
    results.get(workspace).classification?.kind === "infrastructure",
);
const failures = [...vulnerable, ...unavailable];
if (failures.length > 0) {
  if (vulnerable.length > 0) {
    console.error(
      `\nHigh-severity dependency advisories found: ${vulnerable.join(", ")}`,
    );
  }
  if (unavailable.length > 0) {
    console.error(
      `\nDependency audit remained unavailable after ${maxAttempts} attempts: ${unavailable.join(", ")}.`,
    );
  }
  process.exitCode = 1;
} else {
  console.log("\nHigh-severity dependency audit passed for all workspaces.");
}
