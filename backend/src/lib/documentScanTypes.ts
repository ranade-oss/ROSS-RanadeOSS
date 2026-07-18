export type DocumentScanStatus = "pending" | "clean" | "infected" | "failed";

export type DocumentScanJob = {
  id: string;
  document_id: string;
  version_id: string;
  user_id: string;
  quarantine_storage_path: string;
  clean_storage_path: string;
  derived_storage_path: string | null;
  filename: string;
  file_type: string;
  size_bytes: number;
  content_type: string;
  status: "queued" | "processing" | "clean" | "infected" | "failed";
  attempts: number;
  previous_storage_path: string | null;
  previous_pdf_storage_path: string | null;
  previous_current_version_id: string | null;
  previous_scan_status: DocumentScanStatus | null;
};

export type FileWorkerResult = {
  status: "clean" | "infected" | "failed";
  engine: "clamav";
  result: string;
  sha256: string;
  signatureVersion: string | null;
  pageCount: number | null;
  derivedCreated: boolean;
  failureCode: string | null;
};
