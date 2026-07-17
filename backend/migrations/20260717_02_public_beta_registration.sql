-- Deliverable G: persist public-beta registration acknowledgements without
-- exposing profile tables to browser roles.

alter table public.user_profiles
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_notice_version text,
  add column if not exists privacy_acknowledged_at timestamptz,
  add column if not exists registration_source text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (
    user_id,
    email,
    display_name,
    organisation,
    terms_version,
    terms_accepted_at,
    privacy_notice_version,
    privacy_acknowledged_at,
    registration_source
  )
  values (
    new.id,
    lower(new.email),
    nullif(btrim(new.raw_user_meta_data ->> 'ross_display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'ross_organisation'), ''),
    case when new.raw_user_meta_data ->> 'ross_terms_accepted' = 'true'
      then nullif(btrim(new.raw_user_meta_data ->> 'ross_terms_version'), '') end,
    case when new.raw_user_meta_data ->> 'ross_terms_accepted' = 'true'
      then now() end,
    case when new.raw_user_meta_data ->> 'ross_privacy_acknowledged' = 'true'
      then nullif(btrim(new.raw_user_meta_data ->> 'ross_privacy_version'), '') end,
    case when new.raw_user_meta_data ->> 'ross_privacy_acknowledged' = 'true'
      then now() end,
    nullif(btrim(new.raw_user_meta_data ->> 'ross_registration_source'), '')
  )
  on conflict (user_id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
exception when others then
  -- Preserve inherited Mike behaviour: profile creation must not block auth.
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.user_profiles enable row level security;
revoke all on table public.user_profiles from anon, authenticated;
