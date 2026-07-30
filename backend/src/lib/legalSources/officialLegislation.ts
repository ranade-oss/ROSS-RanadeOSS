import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { A2ajClient, type A2ajDocument } from "./a2ajClient";
import type {
    JurisdictionCode,
    LegalLegislationDocument,
    LegalLegislationSection,
    LegalLegislationSummary,
    LegalSourceLanguage,
    LegalSourceProvider,
} from "./types";

type LegislationEntry = {
    sourceId: string;
    jurisdiction: JurisdictionCode;
    kind: "legislation" | "regulation" | "rule";
    title: string;
    citation: string;
    canonicalUrl: string;
    alternateLanguageUrl: string | null;
    englishPath?: string;
    frenchPath?: string;
};

type OntarioDocumentApiResponse = {
    content?: unknown;
    alias?: unknown;
    state?: unknown;
    title?: unknown;
    actName?: unknown;
    dateFrom?: unknown;
};

const JUSTICE_LOOKUP_URL =
    "https://raw.githubusercontent.com/justicecanada/laws-lois-xml/main/lookup/lookup.xml";
const ONTARIO_DISCOVERY_DATASETS = [
    "LEGISLATION-ON",
    "REGULATIONS-ON",
] as const;
const dynamicOntarioEntries = new Map<string, LegislationEntry>();
let liveFederalEntriesPromise: Promise<LegislationEntry[]> | null = null;

const ONTARIO_ENTRIES: LegislationEntry[] = [
    entry(
        "ontario-statute-90c43",
        "legislation",
        "Courts of Justice Act",
        "R.S.O. 1990, c. C.43",
        "statute/90c43",
    ),
    entry(
        "ontario-regulation-900194",
        "rule",
        "Rules of Civil Procedure",
        "R.R.O. 1990, Reg. 194",
        "regulation/900194",
    ),
    entry(
        "ontario-regulation-980258",
        "rule",
        "Rules of the Small Claims Court",
        "O. Reg. 258/98",
        "regulation/980258",
    ),
    entry(
        "ontario-statute-02l24",
        "legislation",
        "Limitations Act, 2002",
        "S.O. 2002, c. 24, Sched. B",
        "statute/02l24",
    ),
    entry(
        "ontario-statute-90e23",
        "legislation",
        "Evidence Act",
        "R.S.O. 1990, c. E.23",
        "statute/90e23",
    ),
    entry(
        "ontario-statute-90f03",
        "legislation",
        "Family Law Act",
        "R.S.O. 1990, c. F.3",
        "statute/90f03",
    ),
    entry(
        "ontario-statute-90l08",
        "legislation",
        "Law Society Act",
        "R.S.O. 1990, c. L.8",
        "statute/90l08",
    ),
    entry(
        "ontario-statute-90s26",
        "legislation",
        "Succession Law Reform Act",
        "R.S.O. 1990, c. S.26",
        "statute/90s26",
    ),
];

const FEDERAL_ENTRIES: LegislationEntry[] = [
    federalEntry(
        "federal-act-c-46",
        "legislation",
        "Criminal Code",
        "R.S.C. 1985, c. C-46",
        "C-46",
    ),
    federalEntry(
        "federal-act-d-3.4",
        "legislation",
        "Divorce Act",
        "R.S.C. 1985, c. 3 (2nd Supp.)",
        "D-3.4",
    ),
    federalEntry(
        "federal-act-c-5",
        "legislation",
        "Canada Evidence Act",
        "R.S.C. 1985, c. C-5",
        "C-5",
    ),
    federalEntry(
        "federal-act-f-7",
        "legislation",
        "Federal Courts Act",
        "R.S.C. 1985, c. F-7",
        "F-7",
    ),
    federalEntry(
        "federal-act-b-3",
        "legislation",
        "Bankruptcy and Insolvency Act",
        "R.S.C. 1985, c. B-3",
        "B-3",
    ),
    federalRegulation(
        "federal-regulation-sor-98-106",
        "rule",
        "Federal Courts Rules",
        "SOR/98-106",
        "SOR-98-106",
    ),
    federalRegulation(
        "federal-regulation-sor-97-175",
        "regulation",
        "Federal Child Support Guidelines",
        "SOR/97-175",
        "SOR-97-175",
    ),
];

export class OntarioELawsProvider implements LegalSourceProvider {
    readonly descriptor = {
        id: "ontario-elaws",
        name: "Ontario e-Laws",
        jurisdictions: ["CA-ON" as const],
        kinds: ["legislation" as const, "regulation" as const, "rule" as const],
        official: true,
        fullTextStatus: "unofficial" as const,
        enabledByDefault: true,
    };

    constructor(
        private readonly fetchImpl: typeof fetch = fetch,
        private readonly discoveryClient = new A2ajClient(),
    ) {}

    async health() {
        try {
            const document = await this.fetchLegislation(
                "ontario-statute-90c43",
                { section: "1" },
            );
            return document.fullText && document.currentToDate
                ? {
                      ok: true,
                      detail: "Ontario e-Laws document and currency APIs returned current legislation.",
                  }
                : {
                      ok: false,
                      detail: "Ontario e-Laws retrieval did not return legislation text and currency metadata.",
                  };
        } catch (error) {
            return {
                ok: false,
                detail:
                    error instanceof Error
                        ? error.message.slice(0, 300)
                        : "Ontario e-Laws retrieval failed.",
            };
        }
    }

    async searchLegislation(input: {
        query: string;
        language?: LegalSourceLanguage;
        kind?: "legislation" | "regulation" | "rule";
        limit?: number;
    }) {
        const limit = Math.min(50, Math.max(1, input.limit ?? 10));
        const datasets =
            input.kind === "legislation"
                ? [ONTARIO_DISCOVERY_DATASETS[0]]
                : input.kind === "regulation" || input.kind === "rule"
                  ? [ONTARIO_DISCOVERY_DATASETS[1]]
                  : [...ONTARIO_DISCOVERY_DATASETS];
        try {
            const responses = await Promise.all(
                datasets.map((dataset) =>
                    this.discoveryClient.search({
                        query: input.query,
                        docType: "laws",
                        dataset,
                        language: input.language,
                        size: limit,
                    }),
                ),
            );
            const discovered = responses
                .flatMap((response) => response.results)
                .map(ontarioEntryFromA2aj)
                .filter((item): item is LegislationEntry => item !== null);
            for (const item of discovered)
                dynamicOntarioEntries.set(item.sourceId, item);
            const combined = dedupeEntries([...ONTARIO_ENTRIES, ...discovered]);
            return searchEntries(
                combined,
                { ...input, limit },
                this.descriptor.id,
            );
        } catch {
            return searchEntries(
                ONTARIO_ENTRIES,
                { ...input, limit },
                this.descriptor.id,
            );
        }
    }

    async fetchLegislation(
        sourceId: string,
        input: {
            language?: LegalSourceLanguage;
            section?: string;
            versionDate?: string;
        } = {},
    ) {
        if (input.versionDate)
            throw new Error(
                "Ontario historical-version retrieval is not enabled until an official stable interface is validated.",
            );
        const item =
            ONTARIO_ENTRIES.find((entry) => entry.sourceId === sourceId) ??
            dynamicOntarioEntries.get(sourceId) ??
            ontarioEntryFromSourceId(sourceId);
        if (!item) throw new Error(`Unknown legislation source: ${sourceId}`);
        const language = input.language ?? "en";
        const url =
            language === "fr" && item.alternateLanguageUrl
                ? item.alternateLanguageUrl
                : item.canonicalUrl;
        const apiUrl = ontarioDocumentApiUrl(item, language);
        const currencyUrl = `https://www.ontario.ca/laws/api/v2/legislation/${language}/currency-date`;
        const [rawDocument, rawCurrencyDate] = await Promise.all([
            safeOfficialFetch(this.fetchImpl, apiUrl, ["www.ontario.ca"]),
            safeOfficialFetch(this.fetchImpl, currencyUrl, ["www.ontario.ca"]),
        ]);
        let payload: OntarioDocumentApiResponse;
        try {
            payload = JSON.parse(rawDocument) as OntarioDocumentApiResponse;
        } catch {
            throw new Error(
                "Ontario e-Laws document API returned invalid JSON.",
            );
        }
        if (typeof payload.content !== "string" || !payload.content.trim()) {
            throw new Error(
                "Ontario e-Laws document API returned no legislation content.",
            );
        }
        const fullText = htmlToText(payload.content);
        const allSections = parseOntarioSections(fullText, url);
        const sections = input.section
            ? filterSection(allSections, input.section)
            : allSections;
        const identifiedItem = identifyOntarioEntry(item, payload, language);
        dynamicOntarioEntries.set(identifiedItem.sourceId, identifiedItem);
        const summary = legislationSummary(
            identifiedItem,
            this.descriptor.id,
            language,
            {
                currentToDate: normalizeLegislationDate(rawCurrencyDate.trim()),
                lastAmendedDate: null,
                verification: "verified",
            },
        );
        return document(summary, rawDocument, fullText, sections, {
            source: "Ontario e-Laws official document API",
            apiUrl,
            officialDisplayUrl: url,
            state: typeof payload.state === "string" ? payload.state : null,
            consolidationStart:
                typeof payload.dateFrom === "string"
                    ? normalizeLegislationDate(payload.dateFrom)
                    : null,
        });
    }
}

export class JusticeLawsProvider implements LegalSourceProvider {
    readonly descriptor = {
        id: "justice-laws-canada",
        name: "Justice Laws Website",
        jurisdictions: ["CA" as const],
        kinds: ["legislation" as const, "regulation" as const, "rule" as const],
        official: true,
        fullTextStatus: "unofficial" as const,
        enabledByDefault: true,
    };

    constructor(private readonly fetchImpl: typeof fetch = fetch) {}

    async health() {
        try {
            const document = await this.fetchLegislation("federal-act-d-3.4", {
                section: "1",
            });
            return document.fullText && document.currentToDate
                ? {
                      ok: true,
                      detail: "Justice Laws production XML path returned current legislation.",
                  }
                : {
                      ok: false,
                      detail: "Justice Laws retrieval did not return legislation text and currency metadata.",
                  };
        } catch (error) {
            return {
                ok: false,
                detail:
                    error instanceof Error
                        ? error.message.slice(0, 300)
                        : "Justice Laws retrieval failed.",
            };
        }
    }

    async searchLegislation(input: {
        query: string;
        language?: LegalSourceLanguage;
        kind?: "legislation" | "regulation" | "rule";
        limit?: number;
    }) {
        const entries = await this.entries();
        return searchEntries(entries, input, this.descriptor.id);
    }

    async fetchLegislation(
        sourceId: string,
        input: {
            language?: LegalSourceLanguage;
            section?: string;
            versionDate?: string;
        } = {},
    ) {
        if (input.versionDate)
            throw new Error(
                "Federal historical-version retrieval requires an explicit archived version and is not inferred from the current XML repository.",
            );
        const item =
            FEDERAL_ENTRIES.find((entry) => entry.sourceId === sourceId) ??
            requireEntry(await this.entries(), sourceId);
        const language = input.language ?? "en";
        const path = language === "fr" ? item.frenchPath : item.englishPath;
        if (!path)
            throw new Error(
                `The requested ${language} XML path is not configured for ${item.title}.`,
            );
        const xmlUrl = `https://raw.githubusercontent.com/justicecanada/laws-lois-xml/main/${path}`;
        const xml = await safeOfficialFetch(this.fetchImpl, xmlUrl, [
            "raw.githubusercontent.com",
        ]);
        const parsed = parseJusticeXml(xml, item, language);
        const sections = input.section
            ? filterSection(parsed.sections, input.section)
            : parsed.sections;
        const summary = legislationSummary(item, this.descriptor.id, language, {
            currentToDate: parsed.currentToDate,
            lastAmendedDate: parsed.lastAmendedDate,
            verification: "verified",
        });
        return document(summary, xml, parsed.fullText, sections, {
            source: "justicecanada/laws-lois-xml",
            xmlUrl,
            officialDisplayUrl:
                language === "fr"
                    ? item.alternateLanguageUrl
                    : item.canonicalUrl,
        });
    }

    private async entries() {
        if (this.fetchImpl !== fetch) {
            try {
                return dedupeEntries([
                    ...FEDERAL_ENTRIES,
                    ...(await loadFederalEntries(this.fetchImpl)),
                ]);
            } catch {
                return FEDERAL_ENTRIES;
            }
        }
        if (!liveFederalEntriesPromise)
            liveFederalEntriesPromise = loadFederalEntries(
                this.fetchImpl,
            ).catch((error) => {
                liveFederalEntriesPromise = null;
                throw error;
            });
        try {
            return dedupeEntries([
                ...FEDERAL_ENTRIES,
                ...(await liveFederalEntriesPromise),
            ]);
        } catch {
            return FEDERAL_ENTRIES;
        }
    }
}

export function parseJusticeXml(
    xml: string,
    item: LegislationEntry,
    language: LegalSourceLanguage,
) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@",
        trimValues: true,
        parseTagValue: false,
    });
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const root = record(parsed.Statute ?? parsed.Regulation);
    if (!Object.keys(root).length)
        throw new Error(
            "Justice Laws XML did not contain a Statute or Regulation root.",
        );
    const sections: LegalLegislationSection[] = [];
    collectJusticeSections(
        root,
        sections,
        language === "fr"
            ? (item.alternateLanguageUrl ?? item.canonicalUrl)
            : item.canonicalUrl,
    );
    return {
        currentToDate: normalizeLegislationDate(
            text(root["@lims:current-date"]),
        ),
        lastAmendedDate: normalizeLegislationDate(
            text(root["@lims:lastAmendedDate"]),
        ),
        fullText: nodeText(root),
        sections,
    };
}

export function parseOntarioSections(
    fullText: string,
    sourceUrl: string,
): LegalLegislationSection[] {
    const lines = fullText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const sections: LegalLegislationSection[] = [];
    for (const line of lines) {
        const match = line.match(
            /^(\d+(?:\.\d+)*(?:\s*\([^)]+\))?)\s+(.{8,})$/,
        );
        if (!match) continue;
        sections.push({
            label: match[1].replace(/\s+/g, ""),
            heading: null,
            text: match[2],
            sourceUrl,
            inForceFrom: null,
            lastAmendedDate: null,
        });
    }
    return sections;
}

function collectJusticeSections(
    value: unknown,
    output: LegalLegislationSection[],
    sourceUrl: string,
) {
    if (Array.isArray(value)) {
        value.forEach((item) =>
            collectJusticeSections(item, output, sourceUrl),
        );
        return;
    }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    const sections = array(row.Section);
    for (const rawSection of sections) {
        const section = record(rawSection);
        const label = nodeText(section.Label);
        if (label)
            output.push({
                label,
                heading: nodeText(section.MarginalNote) || null,
                text: nodeText(section),
                sourceUrl: stableSectionUrl(sourceUrl, label),
                inForceFrom: normalizeLegislationDate(
                    text(section["@lims:inforce-start-date"]),
                ),
                lastAmendedDate: normalizeLegislationDate(
                    text(section["@lims:lastAmendedDate"]),
                ),
            });
    }
    for (const [key, child] of Object.entries(row))
        if (key !== "Section") collectJusticeSections(child, output, sourceUrl);
}

async function safeOfficialFetch(
    fetchImpl: typeof fetch,
    url: string,
    allowedHosts: string[],
) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname))
        throw new Error("Official-source URL is not allowlisted.");
    const response = await fetchImpl(url, {
        headers: {
            Accept: "application/json, text/plain, text/html, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
        throw new Error(
            `Official legislation source returned HTTP ${response.status}.`,
        );
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > 15_000_000)
        throw new Error(
            "Official legislation response exceeds the 15 MB safety limit.",
        );
    const body = await response.text();
    if (body.length > 15_000_000)
        throw new Error(
            "Official legislation response exceeds the 15 MB safety limit.",
        );
    return body;
}

function ontarioDocumentApiUrl(
    item: LegislationEntry,
    language: LegalSourceLanguage,
) {
    const displayUrl =
        language === "fr" && item.alternateLanguageUrl
            ? item.alternateLanguageUrl
            : item.canonicalUrl;
    const parts = new URL(displayUrl).pathname.split("/").filter(Boolean);
    const rootIndex = parts.findIndex(
        (part) => part === "laws" || part === "lois",
    );
    const type = parts[rootIndex + 1];
    const code = parts[rootIndex + 2];
    if (rootIndex < 0 || !type || !code) {
        throw new Error("Ontario e-Laws document path is invalid.");
    }
    return `https://www.ontario.ca/laws/api/v2/legislation/${language}/doc-search/${encodeURIComponent(type)}/${encodeURIComponent(code)}`;
}

function searchEntries(
    entries: LegislationEntry[],
    input: {
        query: string;
        language?: LegalSourceLanguage;
        kind?: "legislation" | "regulation" | "rule";
        limit?: number;
    },
    providerId: string,
) {
    const words = input.query
        .toLocaleLowerCase("en-CA")
        .split(/\s+/)
        .filter(Boolean);
    return entries
        .filter((item) => !input.kind || item.kind === input.kind)
        .map((item) => ({
            item,
            score: words.reduce(
                (score, word) =>
                    score +
                    (`${item.title} ${item.citation}`
                        .toLocaleLowerCase("en-CA")
                        .includes(word)
                        ? 1
                        : 0),
                0,
            ),
        }))
        .filter(({ score }) => score > 0)
        .sort(
            (a, b) =>
                b.score - a.score || a.item.title.localeCompare(b.item.title),
        )
        .slice(0, Math.min(50, Math.max(1, input.limit ?? 10)))
        .map(({ item }) =>
            legislationSummary(item, providerId, input.language ?? "en"),
        );
}

function legislationSummary(
    item: LegislationEntry,
    providerId: string,
    language: LegalSourceLanguage,
    override: Partial<LegalLegislationSummary> = {},
): LegalLegislationSummary {
    return {
        providerId,
        sourceId: item.sourceId,
        jurisdiction: item.jurisdiction,
        kind: item.kind,
        title: item.title,
        citation: item.citation,
        language,
        canonicalUrl:
            language === "fr" && item.alternateLanguageUrl
                ? item.alternateLanguageUrl
                : item.canonicalUrl,
        alternateLanguageUrl:
            language === "fr" ? item.canonicalUrl : item.alternateLanguageUrl,
        currentToDate: null,
        lastAmendedDate: null,
        inForceStatus: "unknown",
        verification: "unverified",
        ...override,
    };
}

function document(
    summary: LegalLegislationSummary,
    source: string,
    fullText: string,
    sections: LegalLegislationSection[],
    providerPayload: Record<string, unknown>,
): LegalLegislationDocument {
    return {
        ...summary,
        retrievedAt: new Date().toISOString(),
        sections,
        fullText,
        sourceHash: createHash("sha256").update(source).digest("hex"),
        reproductionIsOfficial: false,
        providerPayload,
    };
}

function entry(
    sourceId: string,
    kind: LegislationEntry["kind"],
    title: string,
    citation: string,
    path: string,
): LegislationEntry {
    return {
        sourceId,
        jurisdiction: "CA-ON",
        kind,
        title,
        citation,
        canonicalUrl: `https://www.ontario.ca/laws/${path}`,
        alternateLanguageUrl: `https://www.ontario.ca/fr/lois/${path.replace("statute", "loi").replace("regulation", "reglement")}`,
    };
}

function ontarioEntryFromA2aj(row: A2ajDocument): LegislationEntry | null {
    const candidates = [
        row.source_url_en,
        row.source_url_fr,
        row.url_en,
        row.url_fr,
    ];
    for (const candidate of candidates) {
        if (!candidate) continue;
        const parsed = parseOntarioUrl(candidate);
        if (!parsed) continue;
        const title =
            row.name_en?.trim() ||
            row.name_fr?.trim() ||
            row.citation_en?.trim() ||
            row.citation_fr?.trim();
        if (!title) continue;
        return {
            sourceId: `ontario-${parsed.type}-${parsed.code}`,
            jurisdiction: "CA-ON",
            kind:
                parsed.type === "statute"
                    ? "legislation"
                    : title.toLocaleLowerCase("en-CA").includes("rules")
                      ? "rule"
                      : "regulation",
            title,
            citation:
                row.citation_en?.trim() || row.citation_fr?.trim() || title,
            canonicalUrl: `https://www.ontario.ca/laws/${parsed.type}/${parsed.code}`,
            alternateLanguageUrl: `https://www.ontario.ca/fr/lois/${parsed.type === "statute" ? "loi" : "reglement"}/${parsed.code}`,
        };
    }
    return null;
}

function ontarioEntryFromSourceId(sourceId: string): LegislationEntry | null {
    const match = sourceId.match(
        /^ontario-(statute|regulation)-([a-z0-9.-]+)$/i,
    );
    if (!match) return null;
    const type = match[1].toLocaleLowerCase("en-CA");
    const code = match[2].toLocaleLowerCase("en-CA");
    return {
        sourceId: `ontario-${type}-${code}`,
        jurisdiction: "CA-ON",
        kind: type === "statute" ? "legislation" : "regulation",
        title: `Ontario ${type} ${code}`,
        citation: code,
        canonicalUrl: `https://www.ontario.ca/laws/${type}/${code}`,
        alternateLanguageUrl: `https://www.ontario.ca/fr/lois/${type === "statute" ? "loi" : "reglement"}/${code}`,
    };
}

function parseOntarioUrl(value: string) {
    try {
        const parsed = new URL(value);
        if (
            parsed.protocol !== "https:" ||
            parsed.hostname !== "www.ontario.ca"
        )
            return null;
        const match = parsed.pathname.match(
            /\/(?:laws|fr\/lois)(?:\/api\/v2\/legislation\/(?:en|fr)\/doc-search)?\/(statute|regulation|loi|reglement)\/([a-z0-9.-]+)/i,
        );
        if (!match) return null;
        return {
            type:
                match[1].toLocaleLowerCase("en-CA") === "statute" ||
                match[1].toLocaleLowerCase("en-CA") === "loi"
                    ? ("statute" as const)
                    : ("regulation" as const),
            code: match[2].toLocaleLowerCase("en-CA"),
        };
    } catch {
        return null;
    }
}

function identifyOntarioEntry(
    item: LegislationEntry,
    payload: OntarioDocumentApiResponse,
    language: LegalSourceLanguage,
) {
    const actNames = record(payload.actName);
    const officialTitle =
        text(actNames[language]) ??
        text(payload.actName) ??
        text(payload.title);
    if (!officialTitle || !item.title.startsWith("Ontario ")) return item;
    return {
        ...item,
        title: officialTitle.split(/\s*,\s*(?:R\.S\.O\.|S\.O\.|O\. Reg\.)/)[0],
        citation: text(payload.title) ?? item.citation,
    };
}

function dedupeEntries(entries: LegislationEntry[]) {
    const unique = new Map<string, LegislationEntry>();
    for (const item of entries)
        if (!unique.has(item.sourceId)) unique.set(item.sourceId, item);
    return [...unique.values()];
}

async function loadFederalEntries(fetchImpl: typeof fetch) {
    const xml = await safeOfficialFetch(fetchImpl, JUSTICE_LOOKUP_URL, [
        "raw.githubusercontent.com",
    ]);
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@",
        trimValues: true,
        parseTagValue: false,
    });
    const parsed = record(parser.parse(xml));
    const database = record(parsed.Database);
    const statutes = array(record(database.Statutes).Statute).map(record);
    const regulations = array(record(database.Regulations).Regulation).map(
        record,
    );

    const activeEnglish = (row: Record<string, unknown>) =>
        text(row.Language)?.toLocaleLowerCase("en-CA") === "en" &&
        text(row.ConsolidateFlag)?.toLocaleLowerCase("en-CA") !== "false";
    return [
        ...statutes
            .filter(activeEnglish)
            .map(federalStatuteFromLookup)
            .filter((item): item is LegislationEntry => item !== null),
        ...regulations
            .filter(activeEnglish)
            .map(federalRegulationFromLookup)
            .filter((item): item is LegislationEntry => item !== null),
    ];
}

function federalStatuteFromLookup(
    row: Record<string, unknown>,
): LegislationEntry | null {
    const code = text(row.ChapterNumber);
    const citation = text(row.OfficialNumber) ?? code;
    const title = text(row.ShortTitle);
    if (!code || !title) return null;
    return federalEntry(
        `federal-act-${sourceIdPart(code)}`,
        "legislation",
        title,
        citation ?? code,
        justicePathPart(code),
    );
}

function federalRegulationFromLookup(
    row: Record<string, unknown>,
): LegislationEntry | null {
    const citation = text(row.AlphaNumber);
    const title = text(row.ShortTitle);
    if (!citation || !title) return null;
    const englishCode = justicePathPart(citation);
    const frenchCode = frenchRegulationCode(englishCode);
    return {
        sourceId: `federal-regulation-${sourceIdPart(citation)}`,
        jurisdiction: "CA",
        kind: title.toLocaleLowerCase("en-CA").includes("rules")
            ? "rule"
            : "regulation",
        title,
        citation,
        canonicalUrl: `https://laws-lois.justice.gc.ca/eng/regulations/${englishCode}/`,
        alternateLanguageUrl: `https://laws-lois.justice.gc.ca/fra/reglements/${frenchCode}/`,
        englishPath: `eng/regulations/${englishCode}.xml`,
        frenchPath: `fra/reglements/${frenchCode}.xml`,
    };
}

function sourceIdPart(value: string) {
    return value
        .toLocaleLowerCase("en-CA")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function justicePathPart(value: string) {
    return value.trim().replace(/\//g, "-").replace(/\s+/g, "_");
}

function frenchRegulationCode(value: string) {
    return value.replace(/^SOR-/i, "DORS-").replace(/^SI-/i, "TR-");
}

function federalEntry(
    sourceId: string,
    kind: LegislationEntry["kind"],
    title: string,
    citation: string,
    code: string,
): LegislationEntry {
    return {
        sourceId,
        jurisdiction: "CA",
        kind,
        title,
        citation,
        canonicalUrl: `https://laws-lois.justice.gc.ca/eng/acts/${code}/`,
        alternateLanguageUrl: `https://laws-lois.justice.gc.ca/fra/lois/${code}/`,
        englishPath: `eng/acts/${code}.xml`,
        frenchPath: `fra/lois/${code}.xml`,
    };
}

function federalRegulation(
    sourceId: string,
    kind: LegislationEntry["kind"],
    title: string,
    citation: string,
    code: string,
): LegislationEntry {
    const frenchCode = code.replace(/^SOR-/, "DORS-");
    return {
        sourceId,
        jurisdiction: "CA",
        kind,
        title,
        citation,
        canonicalUrl: `https://laws-lois.justice.gc.ca/eng/regulations/${code}/`,
        alternateLanguageUrl: `https://laws-lois.justice.gc.ca/fra/reglements/${frenchCode}/`,
        englishPath: `eng/regulations/${code}.xml`,
        frenchPath: `fra/reglements/${frenchCode}.xml`,
    };
}

function requireEntry(entries: LegislationEntry[], sourceId: string) {
    const item = entries.find((entry) => entry.sourceId === sourceId);
    if (!item) throw new Error(`Unknown legislation source: ${sourceId}`);
    return item;
}

function filterSection(sections: LegalLegislationSection[], requested: string) {
    const normalized = requested
        .replace(/^s(?:ection)?\.?\s*/i, "")
        .replace(/\s+/g, "");
    return sections.filter(
        (section) =>
            section.label.replace(/\s+/g, "").toLocaleLowerCase("en-CA") ===
            normalized.toLocaleLowerCase("en-CA"),
    );
}

function stableSectionUrl(url: string, label: string) {
    if (!url.includes("laws-lois.justice.gc.ca")) return url;
    return `${url.replace(/\/$/, "")}/section-${encodeURIComponent(label.replace(/\(.*/, ""))}.html`;
}

function htmlToText(html: string) {
    return decodeHtml(
        html
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<\/(?:p|div|li|h[1-6]|section|article|tr)>/gi, "\n")
            .replace(/<br\s*\/?\s*>/gi, "\n")
            .replace(/<[^>]+>/g, " "),
    )
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
}

function decodeHtml(value: string) {
    const entities: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: " ",
    };
    return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
        if (entity.startsWith("#x"))
            return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
        if (entity.startsWith("#"))
            return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
        return entities[entity.toLowerCase()] ?? `&${entity};`;
    });
}

const MONTHS = new Map(
    [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ].map((month, index) => [month, index + 1]),
);

function calendarDate(year: number, month: number, day: number) {
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
        probe.getUTCFullYear() !== year ||
        probe.getUTCMonth() + 1 !== month ||
        probe.getUTCDate() !== day
    ) {
        return null;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeLegislationDate(value: string | null) {
    if (!value) return null;
    const iso = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (iso) return iso;

    const monthFirst = value
        .trim()
        .match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
    if (monthFirst) {
        const month = MONTHS.get(monthFirst[1].toLowerCase());
        if (month)
            return calendarDate(
                Number(monthFirst[3]),
                month,
                Number(monthFirst[2]),
            );
    }

    const dayFirst = value
        .trim()
        .match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})$/i);
    if (dayFirst) {
        const month = MONTHS.get(dayFirst[2].toLowerCase());
        if (month)
            return calendarDate(
                Number(dayFirst[3]),
                month,
                Number(dayFirst[1]),
            );
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) return null;
    return calendarDate(
        parsed.getFullYear(),
        parsed.getMonth() + 1,
        parsed.getDate(),
    );
}

function nodeText(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number")
        return String(value).trim();
    if (Array.isArray(value))
        return value
            .map(nodeText)
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
    if (typeof value !== "object") return "";
    return Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !key.startsWith("@"))
        .map(([, child]) => nodeText(child))
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function array(value: unknown): unknown[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

function text(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
