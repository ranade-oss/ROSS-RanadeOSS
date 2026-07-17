-- User chat messages always include the optional workflow payload. Fresh and
-- upgraded databases must expose the same nullable column so a missing
-- workflow does not prevent the prompt itself from being persisted.

alter table public.chat_messages
  add column if not exists workflow jsonb;
