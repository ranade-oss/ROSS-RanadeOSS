import cors from "cors";
import type { ErrorRequestHandler, RequestHandler } from "express";

export class CorsOriginDeniedError extends Error {
  constructor() {
    super("Origin is not allowed by ROSS CORS policy.");
    this.name = "CorsOriginDeniedError";
  }
}

export function corsPolicy(allowedOrigins: readonly string[]): RequestHandler {
  return cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new CorsOriginDeniedError());
    },
    credentials: true,
  });
}

export const rejectDeniedCorsOrigin: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (!(error instanceof CorsOriginDeniedError)) {
    next(error);
    return;
  }

  res.status(403).json({
    detail: "Request origin is not allowed.",
  });
};
