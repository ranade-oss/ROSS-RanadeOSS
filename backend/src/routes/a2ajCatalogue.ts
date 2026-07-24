import { Router } from "express";
import { z } from "zod";
import { A2ajProvider } from "../lib/legalSources";
import type { JurisdictionCode } from "../lib/legalSources";
import { requireAuth } from "../middleware/auth";

export const a2ajCatalogueRouter = Router();
const provider = new A2ajProvider();
const jurisdictionSchema = z
  .string()
  .regex(/^CA(?:-[A-Z]{2})?$/)
  .optional();

const decisionSearchSchema = z.object({
  query: z.string().trim().min(2).max(500),
  dataset: z.string().trim().min(2).max(100).optional(),
  jurisdiction: jurisdictionSchema,
  language: z.enum(["en", "fr"]).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

const lawSearchSchema = z.object({
  query: z.string().trim().min(2).max(500),
  dataset: z.string().trim().min(2).max(100).optional(),
  jurisdiction: jurisdictionSchema,
  language: z.enum(["en", "fr"]).optional(),
  kind: z.enum(["legislation", "regulation", "rule"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

a2ajCatalogueRouter.use(requireAuth);

a2ajCatalogueRouter.get("/catalogue", async (_req, res) => {
  try {
    return res.json(await provider.catalogue());
  } catch (error) {
    return sourceError(res, error);
  }
});

a2ajCatalogueRouter.get("/decisions", async (req, res) => {
  const parsed = decisionSearchSchema.safeParse(req.query);
  if (!parsed.success)
    return res.status(400).json({
      error: "Invalid A2AJ decision search.",
      issues: parsed.error.issues,
    });
  try {
    return res.json(
      await provider.searchDecisionPage({
        ...parsed.data,
        court: parsed.data.dataset,
        jurisdiction: parsed.data.jurisdiction as JurisdictionCode | undefined,
      }),
    );
  } catch (error) {
    return sourceError(res, error);
  }
});

a2ajCatalogueRouter.get("/laws", async (req, res) => {
  const parsed = lawSearchSchema.safeParse(req.query);
  if (!parsed.success)
    return res.status(400).json({
      error: "Invalid A2AJ law search.",
      issues: parsed.error.issues,
    });
  try {
    return res.json(
      await provider.searchLegislationPage({
        ...parsed.data,
        jurisdiction: parsed.data.jurisdiction as JurisdictionCode | undefined,
      }),
    );
  } catch (error) {
    return sourceError(res, error);
  }
});

function sourceError(res: import("express").Response, error: unknown) {
  return res.status(502).json({
    error: error instanceof Error ? error.message : "A2AJ request failed.",
  });
}
