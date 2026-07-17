import type { RequestHandler } from "express";
import multer from "multer";
import {
  UploadValidationError,
  validateUploadedDocument,
} from "./uploadValidation";

export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_SIZE_MB = Math.round(
  MAX_UPLOAD_SIZE_BYTES / (1024 * 1024),
);

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
    files: 1,
  },
});

export function singleFileUpload(fieldName: string): RequestHandler {
  return (req, res, next) => {
    memoryUpload.single(fieldName)(req, res, (err) => {
      if (!err) {
        if (!req.file) return next();
        void validateUploadedDocument(req.file).then(
          () => next(),
          (validationError: unknown) => {
            if (validationError instanceof UploadValidationError) {
              return void res.status(validationError.status).json({
                detail: validationError.message,
              });
            }
            next(validationError);
          },
        );
        return;
      }

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return void res.status(413).json({
            detail: `File too large. Maximum size is ${MAX_UPLOAD_SIZE_MB} MB.`,
          });
        }
        return void res.status(400).json({
          detail: `Upload failed: ${err.message}`,
        });
      }

      return next(err);
    });
  };
}
