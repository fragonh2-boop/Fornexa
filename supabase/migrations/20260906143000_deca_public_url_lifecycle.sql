begin;

-- DeCA P0: a public URL must remain usable through service completion. The
-- seven-day post-completion period is an optional deactivation point, not a
-- maximum lifetime, so remove the legacy upper-bound check before adding the
-- lifecycle invariant.
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
  add constraint regulatory_document_access_tokens_public_until_not_before_service_completion_check
    check (
      service_completed_at is null
      or public_until is null
      or public_until >= service_completed_at
    );

comment on column public.regulatory_document_access_tokens.public_until is
  'Explicit end of public access. It must not precede service completion; disabling download after seven calendar days is an operational option, not a mandatory maximum lifetime.';

insert into public.fornexa_schema_migrations (version, description)
values (
  '20260906143000_deca_public_url_lifecycle',
  'DeCA public URL lifecycle: remove seven-day upper cap and prevent expiry before service completion'
)
on conflict (version) do nothing;

commit;
