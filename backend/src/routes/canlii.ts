import { Router, type Response } from "express";
import { z } from "zod";
import { CanLiiMetadataProvider } from "../lib/legalSources";
import type { LegalSourceContext } from "../lib/legalSources";
import { getUserModelSettings } from "../lib/userSettings";
import { requireAuth } from "../middleware/auth";

export const canLiiRouter = Router();
const provider = new CanLiiMetadataProvider();

const languageSchema = z.enum(["en", "fr"]).default("en");
const caseListSchema = z.object({
  databaseId: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,100}$/i),
  language: languageSchema,
  offset: z.coerce.number().int().min(0).max(10_000_000).default(0),
  resultCount: z.coerce.number().int().min(1).max(1_000).default(20),
  decisionDateAfter: z.string().date().optional(),
  decisionDateBefore: z.string().date().optional(),
});
const searchLinkSchema = z.object({
  query: z.string().trim().min(2).max(500),
  databaseId: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,100}$/i)
    .optional(),
  jurisdiction: z
    .string()
    .trim()
    .regex(/^(?:CA-)?[A-Z]{2}$/i)
    .optional(),
  language: languageSchema,
});
const citatorSchema = z.object({
  type: z.enum(["citedCases", "citingCases", "citedLegislations"]),
});
const citationSchema = z.object({
  citations: z.array(z.string().trim().min(2).max(250)).min(1).max(20),
});

canLiiRouter.use(requireAuth);

canLiiRouter.get("/search-link", (req, res) => {
  const parsed = searchLinkSchema.safeParse(req.query);
  if (!parsed.success)
    return res.status(400).json({
      error: "Invalid CanLII search link request.",
      issues: parsed.error.issues,
    });
  return res.json({
    url: provider.searchUrl(parsed.data),
    warning:
      "This opens a user-directed search on CanLII. ROSS does not crawl or retrieve CanLII full text.",
  });
});

canLiiRouter.get("/databases", async (req, res) => {
  const language = languageSchema.safeParse(req.query.language);
  if (!language.success)
    return res.status(400).json({ error: "Invalid language." });
  try {
    const context = await userContext(res);
    return res.json({
      databases: await provider.listDatabases(context, language.data),
    });
  } catch (error) {
    return canLiiError(res, error);
  }
});

canLiiRouter.get("/cases", async (req, res) => {
  const parsed = caseListSchema.safeParse(req.query);
  if (!parsed.success)
    return res.status(400).json({
      error: "Invalid CanLII case-list request.",
      issues: parsed.error.issues,
    });
  try {
    const context = await userContext(res);
    return res.json({
      cases: await provider.listCases(parsed.data, context),
      offset: parsed.data.offset,
      resultCount: parsed.data.resultCount,
      nextOffset: parsed.data.offset + parsed.data.resultCount,
    });
  } catch (error) {
    return canLiiError(res, error);
  }
});

canLiiRouter.get("/cases/:databaseId/:caseId", async (req, res) => {
  try {
    const context = await userContext(res);
    return res.json({
      document: await provider.fetchDecision(
        `${req.params.databaseId}/${req.params.caseId}`,
        context,
      ),
    });
  } catch (error) {
    return canLiiError(res, error);
  }
});

canLiiRouter.get("/cases/:databaseId/:caseId/citator", async (req, res) => {
  const parsed = citatorSchema.safeParse(req.query);
  if (!parsed.success)
    return res.status(400).json({
      error: "Invalid CanLII citator request.",
      issues: parsed.error.issues,
    });
  try {
    const context = await userContext(res);
    return res.json({
      result: await provider.citator(
        req.params.databaseId,
        req.params.caseId,
        parsed.data.type,
        context,
      ),
      warning:
        "CanLII citator metadata is not a comprehensive good-law opinion.",
    });
  } catch (error) {
    return canLiiError(res, error);
  }
});

canLiiRouter.post("/citations/verify", async (req, res) => {
  const parsed = citationSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: "Invalid CanLII citation request.",
      issues: parsed.error.issues,
    });
  try {
    return res.json({
      results: await provider.verifyCitations(
        parsed.data.citations,
        await userContext(res),
      ),
    });
  } catch (error) {
    return canLiiError(res, error);
  }
});

async function userContext(res: Response): Promise<LegalSourceContext> {
  const settings = await getUserModelSettings(String(res.locals.userId ?? ""));
  return { apiToken: settings.api_keys.canlii };
}

function canLiiError(res: Response, error: unknown) {
  const message =
    error instanceof Error ? error.message : "CanLII request failed.";
  const status = message.startsWith("Add your own CanLII") ? 400 : 502;
  return res.status(status).json({ error: message });
}
