import type { LegalSourceRegistry } from "./registry";

export type OntarioResearchReadinessCheck = {
    providerId: string;
    status: "healthy" | "degraded";
    stages: string[];
    resultCount: number | null;
    coverageCount: number | null;
    latencyClass: "fast" | "standard" | "slow";
    reasonCode: string;
};

export type OntarioResearchReadiness = {
    status: "healthy" | "degraded";
    checkedAt: string;
    checks: OntarioResearchReadinessCheck[];
    limitations: string[];
};

class ReadinessError extends Error {
    constructor(readonly code: string) {
        super(code);
    }
}

const latencyClass = (milliseconds: number) =>
    milliseconds < 1_000
        ? ("fast" as const)
        : milliseconds < 5_000
          ? ("standard" as const)
          : ("slow" as const);

const failureCode = (error: unknown) => {
    if (error instanceof ReadinessError) return error.code;
    if (error instanceof Error && error.name === "TimeoutError")
        return "timeout";
    return "provider-request-failed";
};

export async function checkOntarioResearchReadiness(
    registry: LegalSourceRegistry,
    options: {
        now?: () => Date;
        clock?: () => number;
    } = {},
): Promise<OntarioResearchReadiness> {
    const now = options.now ?? (() => new Date());
    const clock = options.clock ?? Date.now;
    const checkedAt = now().toISOString();

    const checks = await Promise.all([
        checkA2aj(registry, clock),
        checkLegislation(
            registry,
            "ontario-elaws",
            "Courts of Justice Act",
            "CA-ON",
            clock,
        ),
        checkLegislation(
            registry,
            "justice-laws-canada",
            "Divorce Act",
            "CA",
            clock,
        ),
    ]);

    return {
        status: checks.every((check) => check.status === "healthy")
            ? "healthy"
            : "degraded",
        checkedAt,
        checks,
        limitations: [
            "A healthy check proves current reachability and the tested retrieval path, not comprehensive coverage or legal accuracy.",
            "A2AJ reproductions are unofficial and must be checked against the linked official source.",
            "The check does not establish ONSC, ONCJ, Small Claims, tribunal, historical-law, or good-law coverage.",
        ],
    };
}

async function checkA2aj(
    registry: LegalSourceRegistry,
    clock: () => number,
): Promise<OntarioResearchReadinessCheck> {
    const startedAt = clock();
    const stages: string[] = [];
    let resultCount: number | null = null;
    let coverageCount: number | null = null;
    try {
        const provider = registry.get("a2aj-canada");
        if (
            !provider.coverage ||
            !provider.searchDecisions ||
            !provider.fetchDecision ||
            !provider.findPassages ||
            !provider.searchLegislation ||
            !provider.fetchLegislation
        )
            throw new ReadinessError("provider-capability-missing");
        const coverage = await provider.coverage();
        coverageCount = coverage.length;
        for (const dataset of [
            "ONCA",
            "LEGISLATION-ON",
            "REGULATIONS-ON",
        ])
            if (!coverage.some((row) => row.dataset === dataset))
                throw new ReadinessError(
                    "coverage-missing-required-ontario-dataset",
                );
        stages.push("coverage");

        const results = await provider.searchDecisions({
            query: '"standard of review"',
            jurisdiction: "CA-ON",
            court: "ONCA",
            language: "en",
            limit: 1,
        });
        resultCount = results.length;
        if (!results[0]?.sourceId)
            throw new ReadinessError("search-returned-no-result");
        stages.push("search");

        const document = await provider.fetchDecision(results[0].sourceId);
        if (!document.fullText?.trim())
            throw new ReadinessError("fetch-returned-no-text");
        stages.push("fetch");

        const passages = provider.findPassages(
            document,
            "standard review",
            1,
        );
        if (!passages.length)
            throw new ReadinessError("passage-not-found");
        stages.push("passage");

        const laws = await provider.searchLegislation({
            query: "Courts of Justice Act",
            jurisdiction: "CA-ON",
            language: "en",
            kind: "legislation",
            limit: 1,
        });
        if (!laws[0]?.sourceId)
            throw new ReadinessError("law-search-returned-no-result");
        stages.push("law-search");
        const law = await provider.fetchLegislation(laws[0].sourceId, {
            language: "en",
        });
        if (!law.fullText?.trim())
            throw new ReadinessError("law-fetch-returned-no-text");
        stages.push("law-fetch");
        if (!law.sections.length)
            throw new ReadinessError("law-section-parser-returned-no-results");
        stages.push("law-sections");
        return ready(
            "a2aj-canada",
            stages,
            resultCount,
            coverageCount,
            startedAt,
            clock,
        );
    } catch (error) {
        return degraded(
            "a2aj-canada",
            stages,
            resultCount,
            coverageCount,
            startedAt,
            clock,
            failureCode(error),
        );
    }
}

async function checkLegislation(
    registry: LegalSourceRegistry,
    providerId: "ontario-elaws" | "justice-laws-canada",
    query: string,
    jurisdiction: "CA-ON" | "CA",
    clock: () => number,
): Promise<OntarioResearchReadinessCheck> {
    const startedAt = clock();
    const stages: string[] = [];
    let resultCount: number | null = null;
    try {
        const provider = registry.get(providerId);
        if (!provider.searchLegislation || !provider.fetchLegislation)
            throw new ReadinessError("provider-capability-missing");
        const results = await provider.searchLegislation({
            query,
            jurisdiction,
            language: "en",
            kind: "legislation",
            limit: 1,
        });
        resultCount = results.length;
        if (!results[0]?.sourceId)
            throw new ReadinessError("search-returned-no-result");
        stages.push("search");

        const document = await provider.fetchLegislation(
            results[0].sourceId,
            { language: "en" },
        );
        if (!document.fullText?.trim())
            throw new ReadinessError("fetch-returned-no-text");
        stages.push("fetch");
        if (!document.sections.length)
            throw new ReadinessError("section-parser-returned-no-results");
        stages.push("sections");
        return ready(
            providerId,
            stages,
            resultCount,
            null,
            startedAt,
            clock,
        );
    } catch (error) {
        return degraded(
            providerId,
            stages,
            resultCount,
            null,
            startedAt,
            clock,
            failureCode(error),
        );
    }
}

function ready(
    providerId: string,
    stages: string[],
    resultCount: number | null,
    coverageCount: number | null,
    startedAt: number,
    clock: () => number,
): OntarioResearchReadinessCheck {
    return {
        providerId,
        status: "healthy",
        stages,
        resultCount,
        coverageCount,
        latencyClass: latencyClass(Math.max(0, clock() - startedAt)),
        reasonCode: "ok",
    };
}

function degraded(
    providerId: string,
    stages: string[],
    resultCount: number | null,
    coverageCount: number | null,
    startedAt: number,
    clock: () => number,
    reasonCode: string,
): OntarioResearchReadinessCheck {
    return {
        providerId,
        status: "degraded",
        stages,
        resultCount,
        coverageCount,
        latencyClass: latencyClass(Math.max(0, clock() - startedAt)),
        reasonCode,
    };
}
