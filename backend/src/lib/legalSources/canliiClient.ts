import { z } from "zod";

const CANLII_API_BASE_URL = "https://api.canlii.org/v1";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 1;
const MAX_RETRY_DELAY_MS = 5_000;

const localizedIdSchema = z
  .object({
    en: z.string().optional(),
    fr: z.string().optional(),
  })
  .passthrough();

const caseDatabaseSchema = z
  .object({
    databaseId: z.string().min(1),
    jurisdiction: z.string().min(1),
    name: z.string().min(1),
  })
  .passthrough();

const caseSummarySchema = z
  .object({
    databaseId: z.string().min(1),
    caseId: z.union([z.string(), localizedIdSchema]),
    title: z.string().nullish(),
    citation: z.string().nullish(),
  })
  .passthrough();

const caseMetadataSchema = z
  .object({
    databaseId: z.string().min(1),
    caseId: z.union([z.string(), localizedIdSchema]),
    url: z.string().url(),
    title: z.string().nullish(),
    citation: z.string().nullish(),
    language: z.string().nullish(),
    docketNumber: z.string().nullish(),
    decisionDate: z.string().nullish(),
    keywords: z.string().nullish(),
    concatenatedId: z.string().nullish(),
  })
  .passthrough();

export type CanLiiCaseDatabase = z.infer<typeof caseDatabaseSchema>;
export type CanLiiCaseSummary = z.infer<typeof caseSummarySchema>;
export type CanLiiCaseMetadata = z.infer<typeof caseMetadataSchema>;
export type CanLiiLanguage = "en" | "fr";
export type CanLiiCitatorType =
  | "citedCases"
  | "citingCases"
  | "citedLegislations";

export class CanLiiApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "CanLiiApiError";
  }
}

export class CanLiiClient {
  constructor(
    private readonly apiKey: string,
    private readonly options: {
      baseUrl?: string;
      timeoutMs?: number;
      maxRetries?: number;
      fetchImpl?: typeof fetch;
      now?: () => number;
      sleep?: (milliseconds: number) => Promise<void>;
    } = {},
  ) {
    if (!apiKey.trim())
      throw new CanLiiApiError(
        "Add your own CanLII API key in Account → API Keys.",
      );
  }

  async listCaseDatabases(language: CanLiiLanguage = "en") {
    const raw = await this.request(`/caseBrowse/${language}/`);
    return z.object({ caseDatabases: z.array(caseDatabaseSchema) }).parse(raw)
      .caseDatabases;
  }

  async listCases(input: {
    databaseId: string;
    language?: CanLiiLanguage;
    offset?: number;
    resultCount?: number;
    decisionDateAfter?: string;
    decisionDateBefore?: string;
  }) {
    const language = input.language ?? "en";
    const params = new URLSearchParams({
      offset: String(Math.max(0, input.offset ?? 0)),
      resultCount: String(
        Math.min(1_000, Math.max(1, input.resultCount ?? 20)),
      ),
    });
    if (input.decisionDateAfter)
      params.set("decisionDateAfter", input.decisionDateAfter);
    if (input.decisionDateBefore)
      params.set("decisionDateBefore", input.decisionDateBefore);
    const raw = await this.request(
      `/caseBrowse/${language}/${safeId(input.databaseId)}/?${params}`,
    );
    return z.object({ cases: z.array(caseSummarySchema) }).parse(raw).cases;
  }

  async getCase(
    databaseId: string,
    caseId: string,
    language: CanLiiLanguage = "en",
  ) {
    return caseMetadataSchema.parse(
      await this.request(
        `/caseBrowse/${language}/${safeId(databaseId)}/${safeId(caseId)}/`,
      ),
    );
  }

  async getCitator(
    databaseId: string,
    caseId: string,
    metadataType: CanLiiCitatorType,
  ) {
    return z
      .record(z.unknown())
      .parse(
        await this.request(
          `/caseCitator/en/${safeId(databaseId)}/${safeId(caseId)}/${metadataType}`,
        ),
      );
  }

  private async request(path: string): Promise<unknown> {
    const baseUrl = (this.options.baseUrl ?? CANLII_API_BASE_URL).replace(
      /\/$/,
      "",
    );
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("api_key", this.apiKey);
    const maxRetries = Math.max(
      0,
      this.options.maxRetries ?? DEFAULT_MAX_RETRIES,
    );
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const sleep =
      this.options.sleep ??
      ((milliseconds: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    let lastError: CanLiiApiError | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "ROSS-RanadeOSS/0.1",
          },
          signal: AbortSignal.timeout(
            this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          ),
        });
        if (response.ok) return response.json() as Promise<unknown>;
        const retryAfterSeconds = parseRetryAfter(
          response.headers.get("retry-after"),
          this.options.now?.() ?? Date.now(),
        );
        lastError = new CanLiiApiError(
          response.status === 401 || response.status === 403
            ? "CanLII rejected this API key."
            : response.status === 429
              ? retryAfterSeconds !== undefined
                ? `CanLII rate limit reached. Retry after ${retryAfterSeconds} seconds.`
                : "CanLII rate limit reached. Retry shortly."
              : `CanLII metadata request failed (${response.status}).`,
          response.status,
          retryAfterSeconds,
        );
      } catch (error) {
        lastError =
          error instanceof CanLiiApiError
            ? error
            : new CanLiiApiError("CanLII metadata could not be reached.");
      }
      if (!isRetriable(lastError) || attempt === maxRetries) throw lastError;
      if (
        lastError.retryAfterSeconds !== undefined &&
        lastError.retryAfterSeconds * 1_000 > MAX_RETRY_DELAY_MS
      )
        throw lastError;
      const delay =
        lastError.retryAfterSeconds !== undefined
          ? Math.min(MAX_RETRY_DELAY_MS, lastError.retryAfterSeconds * 1_000)
          : Math.min(MAX_RETRY_DELAY_MS, 500 * 2 ** attempt);
      await sleep(delay);
    }
    throw (
      lastError ?? new CanLiiApiError("CanLII metadata could not be reached.")
    );
  }
}

function parseRetryAfter(value: string | null, now: number) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(0, Math.ceil((date - now) / 1_000))
    : undefined;
}

function isRetriable(error: CanLiiApiError) {
  return (
    error.status === 429 || (error.status !== undefined && error.status >= 500)
  );
}

export function localizedCanLiiId(
  value: string | { en?: string; fr?: string },
  language: CanLiiLanguage = "en",
) {
  if (typeof value === "string") return value;
  return value[language] ?? value.en ?? value.fr ?? "";
}

export function buildCanLiiSearchUrl(input: {
  query: string;
  databaseId?: string;
  jurisdiction?: string;
  language?: CanLiiLanguage;
}) {
  const language = input.language ?? "en";
  const jurisdiction = normalizeJurisdiction(input.jurisdiction);
  const databaseId = input.databaseId?.trim().toLowerCase();
  const path = databaseId
    ? `/${language}/${jurisdiction ?? "ca"}/${safeId(databaseId)}/`
    : jurisdiction
      ? `/${language}/${jurisdiction}/`
      : `/${language}/`;
  const query = encodeURIComponent(input.query.trim());
  return `https://www.canlii.org${path}#search/type=decision&text=${query}`;
}

function normalizeJurisdiction(value?: string) {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase().replace(/^ca-/, "");
  return /^[a-z]{2}$/.test(normalized) || normalized === "ca"
    ? normalized
    : null;
}

function safeId(value: string) {
  const normalized = value.trim();
  if (!/^[a-z0-9-]{1,100}$/i.test(normalized))
    throw new CanLiiApiError("Invalid CanLII database or document id.");
  return encodeURIComponent(normalized);
}
