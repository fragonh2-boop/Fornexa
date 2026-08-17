-- Keep the CMR sequence at or above the highest number already persisted for the current UTC year.
-- This is safe to re-run and prevents imported/manual CMR rows from leaving cmr_number_seq behind.
do $$
declare
  yy text := to_char(timezone('utc', now()), 'YY');
  max_suffix bigint;
  current_value bigint;
begin
  select coalesce(max(substring(cmr_number from 7)::bigint), 0)
    into max_suffix
  from public.cmr_documents
  where cmr_number like ('CMR-' || yy || '%')
    and cmr_number ~ ('^CMR-' || yy || '[0-9]{6}$');

  select last_value into current_value from public.cmr_number_seq;

  perform setval(
    'public.cmr_number_seq',
    greatest(max_suffix, current_value, 1),
    true
  );
end
$$;

insert into public.fornexa_schema_migrations (version, description)
values ('20260818_cmr_number_sequence_resync', 'Resync cmr_number_seq with the highest persisted CMR number for the current year')
on conflict (version) do nothing;
