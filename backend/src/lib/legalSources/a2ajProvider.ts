import {
    A2ajClient,
    type A2ajCoverageRow,
    type A2ajDocument,
} from "./a2ajClient";
import type {
    JurisdictionCode,
    LegalCitationResult,
    LegalDecisionDocument,
    LegalDecisionSummary,
    LegalLegislationDocument,
    LegalLegislationSection,
    LegalLegislationSummary,
    LegalSourceCoverage,
    LegalSourceLanguage,
    LegalSourceProvider,
    LegalSourcePassage,
} from "./types";

const CANADIAN_DATASETS: Record<
    string,
    { label: string; jurisdiction: JurisdictionCode }
> = {
    ONCA: { label: "Ontario Court of Appeal", jurisdiction: "CA-ON" },
    SCC: { label: "Supreme Court of Canada", jurisdiction: "CA" },
    FCA: { label: "Federal Court of Appeal", jurisdiction: "CA" },
    FC: { label: "Federal Court", jurisdiction: "CA" },
    TCC: { label: "Tax Court of Canada", jurisdiction: "CA" },
    CMAC: { label: "Court Martial Appeal Court", jurisdiction: "CA" },
};

const CANADIAN_LAW_DATASETS: Record<
    string,
    {
        label: string;
        jurisdiction: JurisdictionCode;
        kind: "legislation" | "regulation";
    }
> = {
    "LEGISLATION-ON": {
        label: "Ontario legislation",
        jurisdiction: "CA-ON",
        kind: "legislation",
    },
    "REGULATIONS-ON": {
        label: "Ontario regulations",
        jurisdiction: "CA-ON",
        kind: "regulation",
    },
    "LEGISLATION-FED": {
        label: "Federal legislation",
        jurisdiction: "CA",
        kind: "legislation",
    },
    "REGULATIONS-FED": {
        label: "Federal regulations",
        jurisdiction: "CA",
        kind: "regulation",
    },
};

const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed =
        typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
};

export class A2ajProvider implements LegalSourceProvider {
    readonly descriptor = {
        id: "a2aj-canada",
        name: "A2AJ Canadian Legal Data",
        jurisdictions: ["CA" as const, "CA-ON" as const],
        kinds: [
            "decision" as const,
            "legislation" as const,
            "regulation" as const,
            "rule" as const,
        ],
        official: false,
        fullTextStatus: "unofficial" as const,
        enabledByDefault: true,
    };

    private coverageCache: {
        expiresAt: number;
        rows: LegalSourceCoverage[];
    } | null = null;

    constructor(private readonly client = new A2ajClient()) {}

    async health() {
        try {
            const coverage = await this.coverage();
            return coverage.length
                ? {
                      ok: true,
                      detail: `${coverage.length} supported Canadian datasets reported by A2AJ.`,
                  }
                : {
                      ok: false,
                      detail: "A2AJ returned no supported Canadian coverage.",
                  };
        } catch (error) {
            return {
                ok: false,
                detail:
                    error instanceof Error
                        ? error.message
                        : "A2AJ health check failed.",
            };
        }
    }

    async searchDecisions(input: {
        query: string;
        court?: string;
        jurisdiction?: JurisdictionCode;
        language?: LegalSourceLanguage;
        from?: string;
        to?: string;
        limit?: number;
        offset?: number;
    }): Promise<LegalDecisionSummary[]> {
        const dataset = normalizeDataset(input.court);
        if (input.jurisdiction === "CA-ON" && dataset && dataset !== "ONCA")
            return [];
        const response = await this.client.search({
            query: input.query,
            docType: "cases",
            dataset:
                dataset ??
                (input.jurisdiction === "CA-ON" ? "ONCA" : undefined),
            language: input.language,
            from: input.from,
            to: input.to,
            size: input.limit,
            offset: input.offset,
        });
        return response.results.map((row) => this.summary(row, input.language));
    }

    async fetchDecision(sourceId: string): Promise<LegalDecisionDocument> {
        const row = await this.client.fetchByCitation(sourceId, "cases");
        const language = preferredLanguage(row);
        const summary = this.summary(row, language);
        const fullText = languageValue(row, "unofficial_text", language);
        return {
            ...summary,
            retrievedAt: new Date().toISOString(),
            fullText,
            passages: fullText
                ? [
                      {
                          text: fullText,
                          language,
                          paragraphStart: null,
                          paragraphEnd: null,
                          sourceUrl: summary.canonicalUrl,
                          verification: "partial",
                      },
                  ]
                : [],
            providerPayload: row,
        };
    }

    async verifyCitations(citations: string[]): Promise<LegalCitationResult[]> {
        return Promise.all(
            citations.map(async (citation) => {
                try {
                    const row = await this.client.fetchByCitation(
                        citation,
                        "cases",
                    );
                    const summary = this.summary(row);
                    const matches = [
                        text(row.citation_en),
                        text(row.citation_fr),
                        text(row.citation2_en),
                        text(row.citation2_fr),
                    ]
                        .filter(Boolean)
                        .some(
                            (candidate) =>
                                normalizeCitation(candidate!) ===
                                normalizeCitation(citation),
                        );
                    return {
                        input: citation,
                        providerId: this.descriptor.id,
                        status: matches
                            ? ("verified" as const)
                            : ("partial" as const),
                        sourceId: summary.sourceId,
                        canonicalUrl: summary.canonicalUrl,
                        providerPayload: row,
                    };
                } catch {
                    return {
                        input: citation,
                        providerId: this.descriptor.id,
                        status: "unavailable" as const,
                        sourceId: null,
                        canonicalUrl: null,
                    };
                }
            }),
        );
    }

    async searchLegislation(input: {
        query: string;
        jurisdiction?: JurisdictionCode;
        language?: LegalSourceLanguage;
        kind?: "legislation" | "regulation" | "rule";
        limit?: number;
    }): Promise<LegalLegislationSummary[]> {
        const datasets = lawDatasets(input.jurisdiction, input.kind);
        const limit = Math.min(50, Math.max(1, input.limit ?? 10));
        const responses = await Promise.all(
            datasets.map((dataset) =>
                this.client.search({
                    query: input.query,
                    docType: "laws",
                    dataset,
                    language: input.language,
                    size: limit,
                }),
            ),
        );
        return responses
            .flatMap((response) => response.results)
            .map((row) => this.legislationSummary(row, input.language))
            .slice(0, limit);
    }

    async fetchLegislation(
        sourceId: string,
        input: {
            language?: LegalSourceLanguage;
            section?: string;
            versionDate?: string;
        } = {},
    ): Promise<LegalLegislationDocument> {
        if (input.versionDate)
            throw new Error(
                "A2AJ historical-version retrieval is not inferred from the current unofficial dataset.",
            );
        const row = await this.client.fetchByCitation(sourceId, "laws");
        const language =
            input.language && languageHasContent(row, input.language)
                ? input.language
                : preferredLanguage(row);
        const summary = this.legislationSummary(row, language);
        const fullText = languageValue(row, "unofficial_text", language);
        const allSections = a2ajLegislationSections(
            fullText,
            summary.canonicalUrl,
        );
        const requested = input.section?.replace(/^s(?:ection)?\.?\s*/i, "");
        const sections = requested
            ? allSections.filter(
                  (section) =>
                      section.label.toLocaleLowerCase("en-CA") ===
                      requested.toLocaleLowerCase("en-CA"),
              )
            : allSections;
        return {
            ...summary,
            retrievedAt: new Date().toISOString(),
            sections,
            fullText,
            sourceHash: null,
            reproductionIsOfficial: false,
            providerPayload: row,
        };
    }

    async coverage(): Promise<LegalSourceCoverage[]> {
        if (this.coverageCache && this.coverageCache.expiresAt > Date.now())
            return this.coverageCache.rows;
        const checkedAt = new Date().toISOString();
        const raw = await this.client.coverage();
        const rows = raw
            .map((row) =>
                normalizeCoverageRow(row, checkedAt, this.descriptor.id),
            )
            .filter((row): row is LegalSourceCoverage => row !== null);
        this.coverageCache = { expiresAt: Date.now() + 15 * 60_000, rows };
        return rows;
    }

    findPassages(
        document: LegalDecisionDocument,
        query: string,
        limit = 5,
    ): LegalSourcePassage[] {
        return findA2ajPassages(document, query, limit);
    }

    private summary(
        row: A2ajDocument,
        requestedLanguage?: LegalSourceLanguage,
    ): LegalDecisionSummary {
        const language =
            requestedLanguage && languageHasContent(row, requestedLanguage)
                ? requestedLanguage
                : preferredLanguage(row);
        const dataset = row.dataset.toUpperCase();
        const datasetInfo = CANADIAN_DATASETS[dataset];
        return {
            providerId: this.descriptor.id,
            sourceId:
                languageValue(row, "citation", language) ??
                text(row.citation_en) ??
                text(row.citation_fr) ??
                `${dataset}:unknown`,
            jurisdiction: datasetInfo?.jurisdiction ?? "CA",
            caseName: languageValue(row, "name", language),
            citation: languageValue(row, "citation", language),
            court: datasetInfo?.label ?? dataset,
            decisionDate: normalizeDate(
                languageValue(row, "document_date", language),
            ),
            canonicalUrl: languageValue(row, "url", language),
            snippet: snippet(languageValue(row, "unofficial_text", language)),
            language,
            alternateLanguageUrl: languageValue(
                row,
                "url",
                language === "en" ? "fr" : "en",
            ),
            fullTextStatus: this.descriptor.fullTextStatus,
            upstreamLicense: text(row.upstream_license),
            verification: "partial",
        };
    }

    private legislationSummary(
        row: A2ajDocument,
        requestedLanguage?: LegalSourceLanguage,
    ): LegalLegislationSummary {
        const language =
            requestedLanguage && languageHasContent(row, requestedLanguage)
                ? requestedLanguage
                : preferredLanguage(row);
        const dataset = row.dataset.toUpperCase();
        const datasetInfo = CANADIAN_LAW_DATASETS[dataset];
        const citation =
            languageValue(row, "citation", language) ??
            text(row.citation_en) ??
            text(row.citation_fr) ??
            `${dataset}:unknown`;
        return {
            providerId: this.descriptor.id,
            sourceId: citation,
            jurisdiction: datasetInfo?.jurisdiction ?? "CA",
            kind: datasetInfo?.kind ?? "legislation",
            title:
                languageValue(row, "name", language) ??
                citation ??
                datasetInfo?.label ??
                dataset,
            citation,
            language,
            canonicalUrl:
                languageValue(row, "url", language) ??
                "https://a2aj.ca/data/",
            alternateLanguageUrl: languageValue(
                row,
                "url",
                language === "en" ? "fr" : "en",
            ),
            currentToDate: normalizeDate(
                languageValue(row, "scraped_timestamp", language),
            ),
            lastAmendedDate: null,
            inForceStatus: "unknown",
            verification: "partial",
        };
    }
}

function lawDatasets(
    jurisdiction?: JurisdictionCode,
    kind?: "legislation" | "regulation" | "rule",
) {
    const jurisdictions =
        jurisdiction === "CA-ON"
            ? new Set<JurisdictionCode>(["CA-ON"])
            : new Set<JurisdictionCode>(["CA"]);
    return Object.entries(CANADIAN_LAW_DATASETS)
        .filter(
            ([, item]) =>
                jurisdictions.has(item.jurisdiction) &&
                (!kind ||
                    item.kind === kind ||
                    (kind === "rule" && item.kind === "regulation")),
        )
        .map(([dataset]) => dataset);
}

function a2ajLegislationSections(
    fullText: string | null,
    sourceUrl: string,
): LegalLegislationSection[] {
    if (!fullText?.trim()) return [];
    const sections: LegalLegislationSection[] = [];
    let current: LegalLegislationSection | null = null;
    for (const rawLine of fullText.split(/\n+/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const match = line.match(
            /^(\d+(?:\.\d+)*(?:\s*\([^)]+\))?)\s+(.+)$/,
        );
        if (match) {
            current = {
                label: match[1].replace(/\s+/g, ""),
                heading: null,
                text: match[2].trim(),
                sourceUrl,
                inForceFrom: null,
                lastAmendedDate: null,
            };
            sections.push(current);
        } else if (current) {
            current.text = `${current.text}\n${line}`;
        }
    }
    if (sections.length) return sections;
    return fullText
        .split(/\n\s*\n/)
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 500)
        .map((value, index) => ({
            label: `P${index + 1}`,
            heading: null,
            text: value,
            sourceUrl,
            inForceFrom: null,
            lastAmendedDate: null,
        }));
}

export function findA2ajPassages(
    document: LegalDecisionDocument,
    query: string,
    limit = 5,
): LegalSourcePassage[] {
    if (!document.fullText?.trim() || !query.trim()) return [];
    const terms = query
        .toLocaleLowerCase("en-CA")
        .split(/\s+/)
        .filter((term) => term.length >= 3);
    const paragraphs = document.fullText
        .split(/\n\s*\n|(?=\[\d+\]\s)/)
        .map((value) => value.trim())
        .filter(Boolean);
    return paragraphs
        .map((paragraph, index) => ({
            paragraph,
            index,
            score: terms.reduce(
                (score, term) =>
                    score +
                    (paragraph.toLocaleLowerCase("en-CA").includes(term)
                        ? 1
                        : 0),
                0,
            ),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, Math.min(10, Math.max(1, limit)))
        .map(({ paragraph, index }) => ({
            text: paragraph,
            language: document.language ?? "en",
            paragraphStart: paragraphNumber(paragraph) ?? index + 1,
            paragraphEnd: paragraphNumber(paragraph) ?? index + 1,
            sourceUrl: document.canonicalUrl,
            verification: "partial",
        }));
}

function normalizeCoverageRow(
    row: A2ajCoverageRow,
    checkedAt: string,
    providerId: string,
): LegalSourceCoverage | null {
    const dataset = (
        text(row.dataset) ??
        text(row.code) ??
        text(row.name)
    )?.toUpperCase();
    const info = dataset
        ? CANADIAN_DATASETS[dataset] ?? CANADIAN_LAW_DATASETS[dataset]
        : undefined;
    if (!dataset || !info) return null;
    return {
        providerId,
        dataset,
        jurisdiction: info.jurisdiction,
        label:
            text(row.label) ??
            text(row.court) ??
            text(row.tribunal) ??
            info.label,
        documentCount:
            number(row.document_count) ?? number(row.count) ?? number(row.rows),
        firstDocumentDate: normalizeDate(
            text(row.first_document_date) ??
                text(row.first_date) ??
                text(row.min_date),
        ),
        lastDocumentDate: normalizeDate(
            text(row.last_document_date) ??
                text(row.last_date) ??
                text(row.max_date),
        ),
        checkedAt,
    };
}

function normalizeDataset(value?: string) {
    if (!value?.trim()) return undefined;
    const normalized = value.trim().toUpperCase();
    if (CANADIAN_DATASETS[normalized]) return normalized;
    return Object.entries(CANADIAN_DATASETS).find(
        ([, item]) => item.label.toUpperCase() === normalized,
    )?.[0];
}

function preferredLanguage(row: A2ajDocument): LegalSourceLanguage {
    return languageHasContent(row, "en") ? "en" : "fr";
}

function languageHasContent(row: A2ajDocument, language: LegalSourceLanguage) {
    return Boolean(
        languageValue(row, "citation", language) ||
        languageValue(row, "name", language) ||
        languageValue(row, "unofficial_text", language),
    );
}

function languageValue(
    row: A2ajDocument,
    field:
        | "citation"
        | "name"
        | "document_date"
        | "url"
        | "unofficial_text"
        | "scraped_timestamp",
    language: LegalSourceLanguage,
) {
    return text(row[`${field}_${language}`]);
}

function normalizeDate(value: string | null) {
    if (!value) return null;
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    return match?.[0] ?? null;
}

function normalizeCitation(value: string) {
    return value
        .replace(/[.,]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

function snippet(value: string | null) {
    if (!value) return null;
    return value.length > 500 ? `${value.slice(0, 497).trimEnd()}...` : value;
}

function paragraphNumber(value: string) {
    const parsed = Number.parseInt(value.match(/^\[(\d+)\]/)?.[1] ?? "", 10);
    return Number.isFinite(parsed) ? parsed : null;
}
