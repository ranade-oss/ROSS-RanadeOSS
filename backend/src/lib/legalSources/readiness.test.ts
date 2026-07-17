import assert from "node:assert/strict";
import test from "node:test";
import { checkOntarioResearchReadiness } from "./readiness";
import { LegalSourceRegistry } from "./registry";
import type { LegalSourceProvider } from "./types";

const descriptor = (
    id: string,
    kinds: LegalSourceProvider["descriptor"]["kinds"],
): LegalSourceProvider["descriptor"] => ({
    id,
    name: id,
    jurisdictions: ["CA", "CA-ON"],
    kinds,
    official: id !== "a2aj-canada",
    fullTextStatus: id === "a2aj-canada" ? "unofficial" : "official",
    enabledByDefault: true,
});

const decisionProvider: LegalSourceProvider = {
    descriptor: descriptor("a2aj-canada", ["decision"]),
    health: async () => ({ ok: true }),
    coverage: async () => [
        {
            providerId: "a2aj-canada",
            dataset: "ONCA",
            jurisdiction: "CA-ON",
            label: "Ontario Court of Appeal",
            documentCount: 1,
            firstDocumentDate: "2025-01-01",
            lastDocumentDate: "2025-01-01",
            checkedAt: "2026-07-17T00:00:00Z",
        },
        {
            providerId: "a2aj-canada",
            dataset: "LEGISLATION-ON",
            jurisdiction: "CA-ON",
            label: "Ontario legislation",
            documentCount: 1,
            firstDocumentDate: "2025-01-01",
            lastDocumentDate: "2025-01-01",
            checkedAt: "2026-07-17T00:00:00Z",
        },
        {
            providerId: "a2aj-canada",
            dataset: "REGULATIONS-ON",
            jurisdiction: "CA-ON",
            label: "Ontario regulations",
            documentCount: 1,
            firstDocumentDate: "2025-01-01",
            lastDocumentDate: "2025-01-01",
            checkedAt: "2026-07-17T00:00:00Z",
        },
    ],
    searchDecisions: async () => [
        {
            providerId: "a2aj-canada",
            sourceId: "2025 ONCA 1",
            jurisdiction: "CA-ON",
            caseName: "Synthetic case",
            citation: "2025 ONCA 1",
            court: "Ontario Court of Appeal",
            decisionDate: "2025-01-01",
            canonicalUrl: "https://example.invalid/case",
            snippet: "standard of review",
            language: "en",
            alternateLanguageUrl: null,
            fullTextStatus: "unofficial",
            upstreamLicense: "synthetic",
            verification: "partial",
        },
    ],
    fetchDecision: async () => ({
        providerId: "a2aj-canada",
        sourceId: "2025 ONCA 1",
        jurisdiction: "CA-ON",
        caseName: "Synthetic case",
        citation: "2025 ONCA 1",
        court: "Ontario Court of Appeal",
        decisionDate: "2025-01-01",
        canonicalUrl: "https://example.invalid/case",
        snippet: "standard of review",
        language: "en",
        alternateLanguageUrl: null,
        fullTextStatus: "unofficial",
        upstreamLicense: "synthetic",
        verification: "partial",
        retrievedAt: "2026-07-17T00:00:00Z",
        fullText: "[1] The standard of review is synthetic.",
        passages: [],
        providerPayload: {},
    }),
    findPassages: () => [
        {
            text: "The standard of review is synthetic.",
            language: "en",
            paragraphStart: 1,
            paragraphEnd: 1,
            sourceUrl: "https://example.invalid/case",
            verification: "partial",
        },
    ],
    searchLegislation: async () => [
        {
            providerId: "a2aj-canada",
            sourceId: "SYNTHETIC-ACT",
            jurisdiction: "CA-ON",
            kind: "legislation",
            title: "Synthetic Ontario Act",
            citation: "SYNTHETIC-ACT",
            language: "en",
            canonicalUrl: "https://example.invalid/a2aj-law",
            alternateLanguageUrl: null,
            currentToDate: "2026-07-17",
            lastAmendedDate: null,
            inForceStatus: "unknown",
            verification: "partial",
        },
    ],
    fetchLegislation: async () => ({
        providerId: "a2aj-canada",
        sourceId: "SYNTHETIC-ACT",
        jurisdiction: "CA-ON",
        kind: "legislation",
        title: "Synthetic Ontario Act",
        citation: "SYNTHETIC-ACT",
        language: "en",
        canonicalUrl: "https://example.invalid/a2aj-law",
        alternateLanguageUrl: null,
        currentToDate: "2026-07-17",
        lastAmendedDate: null,
        inForceStatus: "unknown",
        verification: "partial",
        retrievedAt: "2026-07-17T00:00:00Z",
        sections: [
            {
                label: "1",
                heading: null,
                text: "Synthetic A2AJ law section.",
                sourceUrl: "https://example.invalid/a2aj-law",
                inForceFrom: null,
                lastAmendedDate: null,
            },
        ],
        fullText: "1 Synthetic A2AJ law section.",
        sourceHash: null,
        reproductionIsOfficial: false,
        providerPayload: {},
    }),
};

const legislationProvider = (id: string): LegalSourceProvider => ({
    descriptor: descriptor(id, ["legislation"]),
    health: async () => ({ ok: true }),
    searchLegislation: async () => [
        {
            providerId: id,
            sourceId: `${id}-source`,
            jurisdiction: id === "ontario-elaws" ? "CA-ON" : "CA",
            kind: "legislation",
            title: "Synthetic Act",
            citation: "SYNTHETIC",
            language: "en",
            canonicalUrl: "https://example.invalid/law",
            alternateLanguageUrl: null,
            currentToDate: "2026-07-17",
            lastAmendedDate: null,
            inForceStatus: "unknown",
            verification: "verified",
        },
    ],
    fetchLegislation: async () => ({
        providerId: id,
        sourceId: `${id}-source`,
        jurisdiction: id === "ontario-elaws" ? "CA-ON" : "CA",
        kind: "legislation",
        title: "Synthetic Act",
        citation: "SYNTHETIC",
        language: "en",
        canonicalUrl: "https://example.invalid/law",
        alternateLanguageUrl: null,
        currentToDate: "2026-07-17",
        lastAmendedDate: null,
        inForceStatus: "unknown",
        verification: "verified",
        retrievedAt: "2026-07-17T00:00:00Z",
        sections: [
            {
                label: "1",
                heading: null,
                text: "Synthetic section.",
                sourceUrl: "https://example.invalid/law#1",
                inForceFrom: null,
                lastAmendedDate: null,
            },
        ],
        fullText: "1 Synthetic section.",
        sourceHash: null,
        reproductionIsOfficial: false,
        providerPayload: {},
    }),
});

const registry = () =>
    new LegalSourceRegistry()
        .register(decisionProvider)
        .register(legislationProvider("ontario-elaws"))
        .register(legislationProvider("justice-laws-canada"));

test("Ontario readiness proves coverage, search, fetch, passage, and legislation sections", async () => {
    const result = await checkOntarioResearchReadiness(registry(), {
        now: () => new Date("2026-07-17T12:00:00Z"),
        clock: () => 100,
    });
    assert.equal(result.status, "healthy");
    assert.deepEqual(result.checks[0].stages, [
        "coverage",
        "search",
        "fetch",
        "passage",
        "law-search",
        "law-fetch",
        "law-sections",
    ]);
    assert.deepEqual(result.checks[1].stages, [
        "search",
        "fetch",
        "sections",
    ]);
    assert.doesNotMatch(JSON.stringify(result), /Synthetic section/);
});

test("Ontario readiness degrades with a sanitized reason code", async () => {
    const failing = registry();
    const provider = failing.get("a2aj-canada");
    provider.searchDecisions = async () => {
        throw new Error("private upstream response body");
    };
    const result = await checkOntarioResearchReadiness(failing);
    assert.equal(result.status, "degraded");
    assert.equal(
        result.checks.find((item) => item.providerId === "a2aj-canada")
            ?.reasonCode,
        "provider-request-failed",
    );
    assert.doesNotMatch(JSON.stringify(result), /private upstream response body/);
});
