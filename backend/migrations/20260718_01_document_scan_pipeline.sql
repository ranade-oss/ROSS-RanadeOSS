-- Supabase-first asynchronous malware scan pipeline for hosted ROSS uploads.
--
-- User-supplied versions fail closed until an isolated worker reports a clean
-- scan. Application-generated versions retain the clean default because they
-- are created by ROSS from already-admitted content.

ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS quarantine_storage_path text,
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS scan_engine text,
  ADD COLUMN IF NOT EXISTS scan_signature_version text,
  ADD COLUMN IF NOT EXISTS scan_result text,
  ADD COLUMN IF NOT EXISTS scan_sha256 text,
  ADD COLUMN IF NOT EXISTS scan_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_failure_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'document_versions_scan_status_check'
      AND conrelid = 'public.document_versions'::regclass
  ) THEN
    ALTER TABLE public.document_versions
      ADD CONSTRAINT document_versions_scan_status_check
      CHECK (scan_status IN ('pending', 'clean', 'infected', 'failed'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.document_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_id uuid NOT NULL UNIQUE REFERENCES public.document_versions(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  quarantine_storage_path text NOT NULL,
  clean_storage_path text NOT NULL,
  derived_storage_path text,
  filename text NOT NULL,
  file_type text NOT NULL,
  size_bytes integer NOT NULL,
  content_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  scan_engine text,
  scan_signature_version text,
  scan_result text,
  scan_sha256 text,
  previous_storage_path text,
  previous_pdf_storage_path text,
  previous_current_version_id uuid,
  previous_scan_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_scan_jobs_status_check
    CHECK (status IN ('queued', 'processing', 'clean', 'infected', 'failed')),
  CONSTRAINT document_scan_jobs_attempts_check CHECK (attempts BETWEEN 0 AND 10)
);

CREATE INDEX IF NOT EXISTS document_scan_jobs_claim_idx
  ON public.document_scan_jobs (status, available_at, created_at);

ALTER TABLE public.document_scan_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.document_scan_jobs FROM anon, authenticated;

-- Atomically claim one job. A worker-dispatch loop can safely run on more than
-- one API machine because SKIP LOCKED prevents duplicate claims. Processing
-- jobs become claimable again after fifteen minutes.
CREATE OR REPLACE FUNCTION public.claim_document_scan_job()
RETURNS SETOF public.document_scan_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT j.id
    FROM public.document_scan_jobs j
    WHERE j.attempts < 3
      AND (
        (j.status = 'queued' AND j.available_at <= now())
        OR (j.status = 'processing' AND j.locked_at < now() - interval '15 minutes')
      )
    ORDER BY j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.document_scan_jobs j
  SET
    status = 'processing',
    attempts = j.attempts + 1,
    locked_at = now(),
    updated_at = now()
  FROM candidate
  WHERE j.id = candidate.id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_document_scan_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_document_scan_job() TO service_role;

-- Existing user uploads have no independent scan evidence. Preserve their
-- old paths on jobs, remove the active paths, and require a clean rescan.
INSERT INTO public.document_scan_jobs (
  document_id,
  version_id,
  user_id,
  quarantine_storage_path,
  clean_storage_path,
  derived_storage_path,
  filename,
  file_type,
  size_bytes,
  content_type,
  previous_storage_path,
  previous_pdf_storage_path,
  previous_current_version_id,
  previous_scan_status
)
SELECT
  dv.document_id,
  dv.id,
  d.user_id,
  dv.storage_path,
  'clean/' || d.user_id::text || '/' || dv.document_id::text || '/' || dv.id::text ||
    CASE WHEN coalesce(dv.file_type, '') ~ '^[a-z0-9]{1,16}$'
      THEN '.' || dv.file_type ELSE '.bin' END,
  CASE WHEN coalesce(dv.file_type, '') IN ('doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx')
    THEN 'derived/' || d.user_id::text || '/' || dv.document_id::text || '/' || dv.id::text || '.pdf'
    ELSE NULL END,
  coalesce(nullif(dv.filename, ''), 'document.bin'),
  coalesce(nullif(dv.file_type, ''), 'bin'),
  coalesce(dv.size_bytes, 0),
  'application/octet-stream',
  dv.storage_path,
  dv.pdf_storage_path,
  d.current_version_id,
  dv.scan_status
FROM public.document_versions dv
JOIN public.documents d ON d.id = dv.document_id
WHERE dv.source IN ('upload', 'user_upload')
  AND dv.storage_path IS NOT NULL
ON CONFLICT (version_id) DO NOTHING;

UPDATE public.document_versions
SET
  quarantine_storage_path = storage_path,
  storage_path = NULL,
  pdf_storage_path = NULL,
  scan_status = 'pending',
  scan_engine = NULL,
  scan_result = NULL,
  scan_sha256 = NULL,
  scan_started_at = NULL,
  scan_completed_at = NULL,
  scan_failure_code = NULL
WHERE source IN ('upload', 'user_upload')
  AND storage_path IS NOT NULL;

UPDATE public.documents d
SET status = 'processing', updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM public.document_versions dv
  WHERE dv.id = d.current_version_id
    AND dv.scan_status = 'pending'
);
