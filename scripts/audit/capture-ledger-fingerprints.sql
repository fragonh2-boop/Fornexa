-- Read-only primary-source corroboration without exporting any SQL payload.
-- Canonical SHA256 input matches JSON.stringify(base64Payloads) in the auditor.
begin transaction read only;
set local statement_timeout = '20s';
select now() as observed_at, current_setting('transaction_read_only') as transaction_read_only,
  (select count(*) from supabase_migrations.schema_migrations) as migration_count,
  coalesce(jsonb_agg(jsonb_build_object(
    'version', m.version, 'name', m.name,
    'elements', coalesce(cardinality(m.statements), 0),
    'array_text_md5', md5(m.statements::text),
    'payload_sha256', (select encode(extensions.digest(convert_to(
      '[' || coalesce(string_agg('"' || replace(encode(convert_to(e.statement,'UTF8'),'base64'),chr(10),'') || '"', ',' order by e.ordinality), '') || ']',
      'UTF8'), 'sha256'), 'hex') from unnest(m.statements) with ordinality e(statement,ordinality))
  ) order by m.version), '[]'::jsonb) as migrations
from supabase_migrations.schema_migrations m;
rollback;
