import {
  buildCanLiiSearchUrl,
  CanLiiApiError,
  CanLiiClient,
  localizedCanLiiId,
  type CanLiiCaseDatabase,
  type CanLiiCaseMetadata,
  type CanLiiLanguage,
} from "./canliiClient";
import type {
  JurisdictionCode,
  LegalCitationResult,
  LegalDecisionDocument,
  LegalDecisionSummary,
  LegalSourceContext,
  LegalSourceProvider,
  LegalSourceProviderDescriptor,
} from "./types";

const CANADIAN_JURISDICTIONS: JurisdictionCode[] = [
  "CA",
  "CA-AB",
  "CA-BC",
  "CA-MB",
  "CA-NB",
  "CA-NL",
  "CA-NS",
  "CA-NT",
  "CA-NU",
  "CA-ON",
  "CA-PE",
  "CA-QC",
  "CA-SK",
  "CA-YT",
];

const NEUTRAL_CITATION_DATABASES: Record<string, string[]> = {
  SCC: ["csc-scc"],
  FCA: ["caf"],
  FC: ["cf"],
  ONCA: ["onca"],
  ONSC: ["onsc"],
  ONCJ: ["oncj"],
  BCCA: ["bcca"],
  BCSC: ["bcsc"],
  NSCA: ["nsca"],
  NSSC: ["nssc"],
  YKCA: ["ykca"],
  TCC: ["caci", "tcc-cci"],
  CMAC: ["cmac-cacm"],
};

type CanLiiClientFactory = (apiKey: string) => CanLiiClient;

export class CanLiiMetadataProvider implements LegalSourceProvider {
  readonly descriptor: LegalSourceProviderDescriptor = {
    id: "canlii-licensed",
    name: "CanLII authorized connector",
    jurisdictions: CANADIAN_JURISDICTIONS,
    kinds: ["decision", "legislation", "regulation"],
    official: false,
    fullTextStatus: "metadata-only",
    enabledByDefault: false,
  };

  constructor(
    private readonly clientFactory: CanLiiClientFactory = (apiKey) =>
      new CanLiiClient(apiKey),
  ) {}

  async health(context?: LegalSourceContext) {
    if (!context?.apiToken?.trim())
      return {
        ok: false,
        detail:
          "Optional. Add your own CanLII API key to enable metadata, citation, and citator access.",
      };
    try {
      const databases = await this.client(context).listCaseDatabases("en");
      return {
        ok: true,
        detail: `${databases.length} CanLII case databases are available with your key. Full-text topical search remains user-directed on CanLII.`,
      };
    } catch (error) {
      return {
        ok: false,
        detail:
          error instanceof Error
            ? error.message
            : "CanLII metadata is unavailable.",
      };
    }
  }

  async searchDecisions(
    input: {
      query: string;
      court?: string;
      jurisdiction?: JurisdictionCode;
      language?: CanLiiLanguage;
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
    },
    context?: LegalSourceContext,
  ): Promise<LegalDecisionSummary[]> {
    const client = this.client(context);
    const language = input.language ?? "en";
    const databases = await client.listCaseDatabases(language);
    const citation = parseNeutralCitation(input.query);
    const database = resolveDatabase(databases, input.court, citation);
    if (!database)
      throw new CanLiiApiError(
        "The CanLII REST API has no general full-text search endpoint. Supply a CanLII database or a neutral citation, or open the generated CanLII search link.",
      );

    if (citation) {
      const metadata = await client.getCase(
        database.databaseId,
        citation.caseId,
        language,
      );
      return [this.summary(metadata, database)];
    }

    const limit = Math.min(50, Math.max(1, input.limit ?? 10));
    const cases = await client.listCases({
      databaseId: database.databaseId,
      language,
      offset: input.offset,
      resultCount: Math.min(500, Math.max(50, limit * 10)),
      decisionDateAfter: input.from,
      decisionDateBefore: input.to,
    });
    const terms = searchTerms(input.query);
    const matched = cases
      .filter((item) => {
        const haystack =
          `${item.title ?? ""} ${item.citation ?? ""}`.toLocaleLowerCase(
            "en-CA",
          );
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, limit);
    const metadata = await Promise.all(
      matched.map((item) =>
        client.getCase(
          item.databaseId,
          localizedCanLiiId(item.caseId, language),
          language,
        ),
      ),
    );
    return metadata.map((item) => this.summary(item, database));
  }

  async fetchDecision(sourceId: string, context?: LegalSourceContext) {
    const [databaseId, caseId] = sourceId.split("/", 2);
    if (!databaseId || !caseId)
      throw new CanLiiApiError(
        "A CanLII metadata source id must be databaseId/caseId.",
      );
    const client = this.client(context);
    const databases = await client.listCaseDatabases("en");
    const database =
      databases.find((item) => item.databaseId === databaseId) ?? null;
    const metadata = await client.getCase(databaseId, caseId, "en");
    return this.document(metadata, database);
  }

  async verifyCitations(
    citations: string[],
    context?: LegalSourceContext,
  ): Promise<LegalCitationResult[]> {
    const client = this.client(context);
    const databases = await client.listCaseDatabases("en");
    return Promise.all(
      citations.map(async (citation): Promise<LegalCitationResult> => {
        const parsed = parseNeutralCitation(citation);
        const database = resolveDatabase(databases, undefined, parsed);
        if (!parsed || !database)
          return {
            input: citation,
            providerId: this.descriptor.id,
            status: "unavailable",
            sourceId: null,
            canonicalUrl: buildCanLiiSearchUrl({
              query: citation,
            }),
          };
        try {
          const metadata = await client.getCase(
            database.databaseId,
            parsed.caseId,
            "en",
          );
          const sourceId = `${metadata.databaseId}/${localizedCanLiiId(metadata.caseId)}`;
          return {
            input: citation,
            providerId: this.descriptor.id,
            status: citationMatches(citation, metadata.citation)
              ? "verified"
              : "partial",
            sourceId,
            canonicalUrl: metadata.url,
            providerPayload: metadata,
          };
        } catch {
          return {
            input: citation,
            providerId: this.descriptor.id,
            status: "unavailable",
            sourceId: null,
            canonicalUrl: buildCanLiiSearchUrl({
              query: citation,
              databaseId: database.databaseId,
              jurisdiction: database.jurisdiction,
            }),
          };
        }
      }),
    );
  }

  async listDatabases(
    context: LegalSourceContext,
    language: CanLiiLanguage = "en",
  ) {
    return this.client(context).listCaseDatabases(language);
  }

  async listCases(
    input: Parameters<CanLiiClient["listCases"]>[0],
    context: LegalSourceContext,
  ) {
    return this.client(context).listCases(input);
  }

  async citator(
    databaseId: string,
    caseId: string,
    metadataType: "citedCases" | "citingCases" | "citedLegislations",
    context: LegalSourceContext,
  ) {
    return this.client(context).getCitator(databaseId, caseId, metadataType);
  }

  searchUrl(input: Parameters<typeof buildCanLiiSearchUrl>[0]) {
    return buildCanLiiSearchUrl(input);
  }

  private client(context?: LegalSourceContext) {
    const apiKey = context?.apiToken?.trim();
    if (!apiKey)
      throw new CanLiiApiError(
        "Add your own CanLII API key in Account → API Keys.",
      );
    return this.clientFactory(apiKey);
  }

  private summary(
    metadata: CanLiiCaseMetadata,
    database: CanLiiCaseDatabase | null,
  ): LegalDecisionSummary {
    const language = metadata.language === "fr" ? "fr" : "en";
    const caseId = localizedCanLiiId(metadata.caseId, language);
    return {
      providerId: this.descriptor.id,
      sourceId: `${metadata.databaseId}/${caseId}`,
      jurisdiction: database
        ? canLiiJurisdiction(database.jurisdiction)
        : canLiiJurisdiction(metadata.databaseId),
      caseName: metadata.title ?? null,
      citation: metadata.citation ?? null,
      court: database?.name ?? metadata.databaseId,
      decisionDate: metadata.decisionDate?.slice(0, 10) ?? null,
      canonicalUrl: metadata.url,
      snippet: metadata.keywords ?? null,
      language,
      alternateLanguageUrl: null,
      fullTextStatus: "metadata-only",
      upstreamLicense: null,
      verification: "partial",
    };
  }

  private document(
    metadata: CanLiiCaseMetadata,
    database: CanLiiCaseDatabase | null,
  ): LegalDecisionDocument {
    return {
      ...this.summary(metadata, database),
      retrievedAt: new Date().toISOString(),
      fullText: null,
      passages: [],
      providerPayload: metadata,
    };
  }
}

function parseNeutralCitation(value: string) {
  const match = value
    .toUpperCase()
    .match(/\b(\d{4})\s+([A-Z][A-Z0-9-]{1,12})\s+(\d{1,7})\b/);
  if (!match) return null;
  return {
    year: match[1],
    courtCode: match[2],
    number: match[3],
    caseId: `${match[1]}${match[2].toLowerCase().replace(/-/g, "")}${match[3]}`,
  };
}

function resolveDatabase(
  databases: CanLiiCaseDatabase[],
  court: string | undefined,
  citation: ReturnType<typeof parseNeutralCitation>,
) {
  const requested = court?.trim().toLocaleLowerCase("en-CA");
  if (requested) {
    const direct = databases.find(
      (item) =>
        item.databaseId.toLocaleLowerCase("en-CA") === requested ||
        item.name.toLocaleLowerCase("en-CA") === requested,
    );
    if (direct) return direct;
  }
  if (!citation) return null;
  const candidates = NEUTRAL_CITATION_DATABASES[citation.courtCode] ?? [
    citation.courtCode.toLowerCase(),
  ];
  return (
    databases.find((item) =>
      candidates.includes(item.databaseId.toLowerCase()),
    ) ?? null
  );
}

function searchTerms(value: string) {
  return value
    .toLocaleLowerCase("en-CA")
    .split(/\s+/)
    .map((item) => item.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((item) => item.length >= 2);
}

function citationMatches(input: string, returned: string | null | undefined) {
  const normalize = (value: string) =>
    value
      .toUpperCase()
      .replace(/\(CANLII\)/g, "")
      .replace(/[^A-Z0-9]/g, "");
  return Boolean(returned && normalize(returned).includes(normalize(input)));
}

function canLiiJurisdiction(value: string): JurisdictionCode {
  const code = value.toLowerCase().replace(/^ca-/, "");
  const match = code.match(/^(ab|bc|mb|nb|nl|ns|nt|nu|on|pe|qc|sk|yt)/);
  return match ? (`CA-${match[1].toUpperCase()}` as JurisdictionCode) : "CA";
}
