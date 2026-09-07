begin;

-- DeCA P0-A: the public URL must remain downloadable for at least seven
-- calendar days after service completion. The URL may remain active longer.
-- Remove the legacy upper-bound constraint before adding the minimum window.
do $$
declare
  legacy_constraint text;
begin
  for legacy_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.regulatory_document_access_tokens'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%public_until <=%service_completed_at%7 days%'
  loop
    execute format(
      'alter table public.regulatory_document_access_tokens drop constraint %I',
      legacy_constraint
    );
  end loop;
end $$;

alter table public.regulatory_document_access_tokens
  drop constraint if exists regulatory_document_access_tokens_public_until_not_before_service_completion_check,
  drop constraint if exists regulatory_document_access_tokens_public_until_minimum_check,
  add constraint regulatory_document_access_tokens_public_until_minimum_check
    check (
      service_completed_at is null
      or public_until is null
      or public_until >= service_completed_at + interval '7 days'
    );

comment on column public.regulatory_document_access_tokens.public_until is
  'Explicit end of public access. When service_completed_at is known, public access must remain available for at least seven calendar days after completion; a longer window is allowed.';

insert into public.fornexa_schema_migrations (version, description)
values (
  '20260906143000_deca_public_url_lifecycle',
  'DeCA public URL lifecycle: replace seven-day upper cap with seven-day minimum after service completion'
)
on conflict (version) do nothing;

commit;
