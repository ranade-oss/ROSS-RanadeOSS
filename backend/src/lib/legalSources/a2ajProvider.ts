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
  BCCA: { label: "British Columbia Court of Appeal", jurisdiction: "CA-BC" },
  BCSC: { label: "Supreme Court of British Columbia", jurisdiction: "CA-BC" },
  NSCA: { label: "Nova Scotia Court of Appeal", jurisdiction: "CA-NS" },
  NSSC: { label: "Nova Scotia Supreme Court", jurisdiction: "CA-NS" },
  NSPC: { label: "Nova Scotia Provincial Court", jurisdiction: "CA-NS" },
  NSFC: { label: "Nova Scotia Family Court", jurisdiction: "CA-NS" },
  NSSM: { label: "Nova Scotia Small Claims Court", jurisdiction: "CA-NS" },
  YKCA: { label: "Yukon Court of Appeal", jurisdiction: "CA-YT" },
  CHRT: { label: "Canadian Human Rights Tribunal", jurisdiction: "CA" },
  CIRB: { label: "Canada Industrial Relations Board", jurisdiction: "CA" },
  CITT: {
    label: "Canadian International Trade Tribunal",
    jurisdiction: "CA",
  },
  CT: { label: "Competition Tribunal", jurisdiction: "CA" },
  FPSLREB: {
    label: "Federal Public Sector Labour Relations and Employment Board",
    jurisdiction: "CA",
  },
  OHSTC: {
    label: "Occupational Health and Safety Tribunal Canada",
    jurisdiction: "CA",
  },
  OIC: { label: "Information Commissioner of Canada", jurisdiction: "CA" },
  PSDPT: {
    label: "Public Service Disclosure Protection Tribunal",
    jurisdiction: "CA",
  },
  RAD: { label: "Refugee Appeal Division", jurisdiction: "CA" },
  RPD: { label: "Refugee Protection Division", jurisdiction: "CA" },
  RLLR: { label: "Refugee Law Lab Reporter", jurisdiction: "CA" },
  SST: { label: "Social Security Tribunal", jurisdiction: "CA" },
};

const JURISDICTION_LABELS: Record<string, string> = {
  FED: "Federal",
  ON: "Ontario",
  BC: "British Columbia",
  AB: "Alberta",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NT: "Northwest Territories",
  NS: "Nova Scotia",
  YT: "Yukon",
  SK: "Saskatchewan",
};

const A2AJ_COVERAGE_WARNINGS = [
  "A2AJ coverage is provider-reported, changes over time, and may contain gaps.",
  "A2AJ text is an unofficial reproduction and must be checked against the linked source.",
  "Document counts and date ranges are approximate and do not prove that every published decision or law is present.",
] as const;

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
  ...Object.fromEntries(
    ["BC", "AB", "MB", "NB", "NL", "NT", "NS", "YT", "SK"].flatMap((code) => [
      [
        `LEGISLATION-${code}`,
        {
          label: `${JURISDICTION_LABELS[code]} legislation`,
          jurisdiction: `CA-${code}` as JurisdictionCode,
          kind: "legislation" as const,
        },
      ],
      [
        `REGULATIONS-${code}`,
        {
          label: `${JURISDICTION_LABELS[code]} regulations`,
          jurisdiction: `CA-${code}` as JurisdictionCode,
          kind: "regulation" as const,
        },
      ],
    ]),
  ),
};

export type A2ajSearchPage<T> = {
  results: T[];
  offset: number;
  nextOffset: number | null;
  total: number | null;
  duplicateCount: number;
  warnings: string[];
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
    jurisdictions: [
      "CA" as const,
      "CA-ON" as const,
      "CA-BC" as const,
      "CA-AB" as const,
      "CA-MB" as const,
      "CA-NB" as const,
      "CA-NL" as const,
      "CA-NT" as const,
      "CA-NS" as const,
      "CA-YT" as const,
      "CA-SK" as const,
    ],
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
            detail: `${coverage.length} live Canadian datasets reported by A2AJ. Coverage is unofficial and may contain gaps.`,
          }
        : {
            ok: false,
            detail: "A2AJ returned no supported Canadian coverage.",
          };
    } catch (error) {
      return {
        ok: false,
        detail:
          error instanceof Error ? error.message : "A2AJ health check failed.",
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
    return (await this.searchDecisionPage(input)).results;
  }

  async searchDecisionPage(input: {
    query: string;
    court?: string;
    jurisdiction?: JurisdictionCode;
    language?: LegalSourceLanguage;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<A2ajSearchPage<LegalDecisionSummary>> {
    const requestedDataset = normalizeDataset(input.court);
    const limit = Math.min(100, Math.max(1, input.limit ?? 10));
    const offset = Math.max(0, input.offset ?? 0);
    const allowedDatasets =
      !requestedDataset && input.jurisdiction && input.jurisdiction !== "CA"
        ? new Set(
            (await this.coverage())
              .filter(
                (row) =>
                  row.materialType === "decision" &&
                  row.jurisdiction === input.jurisdiction,
              )
              .map((row) => row.dataset),
          )
        : null;
    if (allowedDatasets && !allowedDatasets.size)
      for (const [dataset, info] of Object.entries(CANADIAN_DATASETS))
        if (info.jurisdiction === input.jurisdiction)
          allowedDatasets.add(dataset);
    const jurisdictionDataset =
      allowedDatasets?.size === 1 ? [...allowedDatasets][0] : undefined;
    const page = await this.scanSearch({
      query: input.query,
      docType: "cases",
      dataset: requestedDataset ?? jurisdictionDataset,
      language: input.language,
      from: input.from,
      to: input.to,
      limit,
      offset,
      allowedDatasets:
        requestedDataset || jurisdictionDataset ? null : allowedDatasets,
      map: (row) => this.summary(row, input.language),
    });
    return {
      ...page,
      warnings: [...A2AJ_COVERAGE_WARNINGS],
    };
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
          const row = await this.client.fetchByCitation(citation, "cases");
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
                normalizeCitation(candidate!) === normalizeCitation(citation),
            );
          return {
            input: citation,
            providerId: this.descriptor.id,
            status: matches ? ("verified" as const) : ("partial" as const),
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
    offset?: number;
  }): Promise<LegalLegislationSummary[]> {
    return (await this.searchLegislationPage(input)).results;
  }

  async searchLegislationPage(input: {
    query: string;
    dataset?: string;
    jurisdiction?: JurisdictionCode;
    language?: LegalSourceLanguage;
    kind?: "legislation" | "regulation" | "rule";
    limit?: number;
    offset?: number;
  }): Promise<A2ajSearchPage<LegalLegislationSummary>> {
    const limit = Math.min(100, Math.max(1, input.limit ?? 10));
    const offset = Math.max(0, input.offset ?? 0);
    const requestedDataset = normalizeDataset(input.dataset);
    if (
      requestedDataset &&
      !/^(LEGISLATION|REGULATIONS)-[A-Z]{2,3}$/.test(requestedDataset)
    )
      throw new Error("Invalid A2AJ legislation dataset.");
    const allowedDatasets = new Set(
      (await this.coverage())
        .filter((row) => {
          if (row.materialType === "decision") return false;
          if (
            input.jurisdiction &&
            input.jurisdiction !== "CA" &&
            row.jurisdiction !== input.jurisdiction
          )
            return false;
          if (
            input.kind &&
            input.kind !== "rule" &&
            row.materialType !== input.kind
          )
            return false;
          return true;
        })
        .map((row) => row.dataset),
    );
    if (!allowedDatasets.size)
      for (const [dataset, info] of Object.entries(CANADIAN_LAW_DATASETS)) {
        if (
          input.jurisdiction &&
          input.jurisdiction !== "CA" &&
          info.jurisdiction !== input.jurisdiction
        )
          continue;
        if (input.kind && input.kind !== "rule" && info.kind !== input.kind)
          continue;
        allowedDatasets.add(dataset);
      }
    const onlyDataset =
      requestedDataset ??
      (allowedDatasets.size === 1 ? [...allowedDatasets][0] : undefined);
    const page = await this.scanSearch({
      query: input.query,
      docType: "laws",
      dataset: onlyDataset,
      language: input.language,
      limit,
      offset,
      allowedDatasets: onlyDataset ? null : allowedDatasets,
      map: (row) => this.legislationSummary(row, input.language),
    });
    return {
      ...page,
      warnings: [...A2AJ_COVERAGE_WARNINGS],
    };
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
    const allSections = a2ajLegislationSections(fullText, summary.canonicalUrl);
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
    const rows = dedupeCoverage(
      raw
        .map((row) => normalizeCoverageRow(row, checkedAt, this.descriptor.id))
        .filter((row): row is LegalSourceCoverage => row !== null),
    );
    this.coverageCache = { expiresAt: Date.now() + 15 * 60_000, rows };
    return rows;
  }

  async catalogue() {
    const datasets = await this.coverage();
    return {
      checkedAt: datasets[0]?.checkedAt ?? new Date().toISOString(),
      datasetCount: datasets.length,
      decisionDatasetCount: datasets.filter(
        (row) => row.materialType === "decision",
      ).length,
      lawDatasetCount: datasets.filter((row) => row.materialType !== "decision")
        .length,
      jurisdictions: [
        ...new Set(datasets.map((row) => row.jurisdiction)),
      ].sort(),
      datasets,
      warnings: [...A2AJ_COVERAGE_WARNINGS],
    };
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
    const datasetInfo =
      CANADIAN_DATASETS[dataset] ?? inferDatasetInfo(dataset, {});
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
      casesCited:
        language === "fr"
          ? (row.cases_cited_fr ?? row.cases_cited_en ?? [])
          : (row.cases_cited_en ?? row.cases_cited_fr ?? []),
      casesCiting:
        language === "fr"
          ? (row.cases_citing_fr ?? row.cases_citing_en ?? [])
          : (row.cases_citing_en ?? row.cases_citing_fr ?? []),
      citingCasesCount: row.citing_cases_count ?? null,
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
    const datasetInfo =
      CANADIAN_LAW_DATASETS[dataset] ?? inferDatasetInfo(dataset, {});
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
        languageValue(row, "url", language) ?? "https://a2aj.ca/data/",
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

  private async scanSearch<T extends { sourceId: string }>(input: {
    query: string;
    docType: "cases" | "laws";
    dataset?: string;
    language?: LegalSourceLanguage;
    from?: string;
    to?: string;
    limit: number;
    offset: number;
    allowedDatasets?: Set<string> | null;
    map: (row: A2ajDocument) => T;
  }): Promise<Omit<A2ajSearchPage<T>, "warnings">> {
    const collected: T[] = [];
    const seen = new Set<string>();
    let duplicateCount = 0;
    let cursor = input.offset;
    let total: number | null = null;
    let exhausted = false;
    let bufferedOffset: number | null = null;
    const batchSize = input.allowedDatasets
      ? 100
      : Math.min(100, input.limit + 1);

    for (
      let request = 0;
      request < 10 && collected.length <= input.limit;
      request += 1
    ) {
      const response = await this.client.search({
        query: input.query,
        docType: input.docType,
        dataset: input.dataset,
        language: input.language,
        from: input.from,
        to: input.to,
        size: batchSize,
        offset: cursor,
      });
      total = response.total ?? total;
      if (!response.results.length) {
        exhausted = true;
        break;
      }
      const batchStart = cursor;
      for (const [index, row] of response.results.entries()) {
        cursor = batchStart + index + 1;
        if (
          input.allowedDatasets &&
          !input.allowedDatasets.has(row.dataset.toUpperCase())
        )
          continue;
        const mapped = input.map(row);
        const key = mapped.sourceId.toLocaleUpperCase("en-CA");
        if (seen.has(key)) {
          duplicateCount += 1;
          continue;
        }
        seen.add(key);
        collected.push(mapped);
        if (collected.length > input.limit) {
          bufferedOffset = cursor - 1;
          break;
        }
      }
      if (bufferedOffset !== null) break;
      if (
        response.results.length < batchSize ||
        (total !== null && cursor >= total)
      ) {
        exhausted = true;
        break;
      }
      if (!input.allowedDatasets && collected.length > input.limit) break;
    }

    return {
      results: collected.slice(0, input.limit),
      offset: input.offset,
      nextOffset: bufferedOffset ?? (exhausted ? null : cursor),
      total,
      duplicateCount,
    };
  }
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
    const match = line.match(/^(\d+(?:\.\d+)*(?:\s*\([^)]+\))?)\s+(.+)$/);
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
          score + (paragraph.toLocaleLowerCase("en-CA").includes(term) ? 1 : 0),
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
  if (!dataset) return null;
  const info =
    CANADIAN_DATASETS[dataset] ??
    CANADIAN_LAW_DATASETS[dataset] ??
    inferDatasetInfo(dataset, row);
  return {
    providerId,
    dataset,
    jurisdiction: info.jurisdiction,
    label:
      text(row.label) ?? text(row.court) ?? text(row.tribunal) ?? info.label,
    materialType: dataset.startsWith("REGULATIONS-")
      ? "regulation"
      : dataset.startsWith("LEGISLATION-")
        ? "legislation"
        : "decision",
    documentCount:
      number(row.document_count) ?? number(row.count) ?? number(row.rows),
    firstDocumentDate: normalizeDate(
      text(row.first_document_date) ??
        text(row.first_date) ??
        text(row.min_date),
    ),
    lastDocumentDate: normalizeDate(
      text(row.last_document_date) ?? text(row.last_date) ?? text(row.max_date),
    ),
    checkedAt,
    warnings: [...A2AJ_COVERAGE_WARNINGS],
  };
}

function normalizeDataset(value?: string) {
  if (!value?.trim()) return undefined;
  const normalized = value.trim().toUpperCase();
  if (/^[A-Z0-9-]{2,40}$/.test(normalized)) return normalized;
  return Object.entries(CANADIAN_DATASETS).find(
    ([, item]) => item.label.toUpperCase() === normalized,
  )?.[0];
}

function inferDatasetInfo(dataset: string, row: A2ajCoverageRow) {
  const explicitJurisdiction = (
    text(row.jurisdiction) ??
    text(row.province) ??
    text(row.region)
  )?.toUpperCase();
  const lawMatch = dataset.match(/^(LEGISLATION|REGULATIONS)-([A-Z]{2,3})$/);
  const prefixMatch = dataset.match(
    /^(ON|BC|AB|MB|NB|NL|NT|NS|NU|PE|QC|SK|YT)/,
  );
  const code = lawMatch?.[2] ?? explicitJurisdiction ?? prefixMatch?.[1];
  const jurisdiction: JurisdictionCode =
    code === "FED" || code === "CA"
      ? "CA"
      : code && /^[A-Z]{2}$/.test(code)
        ? (`CA-${code}` as JurisdictionCode)
        : "CA";
  const kind = dataset.startsWith("REGULATIONS-")
    ? ("regulation" as const)
    : ("legislation" as const);
  return {
    label: text(row.label) ?? text(row.court) ?? text(row.tribunal) ?? dataset,
    jurisdiction,
    kind,
  };
}

function dedupeCoverage(rows: LegalSourceCoverage[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.dataset.toLocaleUpperCase("en-CA");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  return value.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

function snippet(value: string | null) {
  if (!value) return null;
  return value.length > 500 ? `${value.slice(0, 497).trimEnd()}...` : value;
}

function paragraphNumber(value: string) {
  const parsed = Number.parseInt(value.match(/^\[(\d+)\]/)?.[1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}
