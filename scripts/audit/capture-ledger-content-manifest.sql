-- scripts/audit/capture-ledger-content-manifest.sql
-- MUST-145G-1: reproducible, read-only capture of the production Supabase ledger content
-- identity used by docs/verification/supabase-ledger-content-manifest-20261127.json.
--
-- It computes, inside PostgreSQL, the Git blob sha1 of each ledger entry's content, so the
-- comparison against the candidate Git sources does not depend on any client-side tooling:
--   git blob sha1 = sha1('blob ' || octet_length(content) || '\0' || content)
--
-- Run it against the production project read-only. It exports no SQL payload: only names,
-- sizes and digests. It must never be run inside a read-write transaction.

begin transaction read only;

with ledger as (
  select
    version,
    name,
    array_length(statements, 1) as statement_elements,
    array_to_string(statements, E'\n') as content
  from supabase_migrations.schema_migrations
)
select
  version,
  name,
  statement_elements,
  octet_length(content) as content_bytes,
  encode(
    extensions.digest(
      convert_to('blob ' || octet_length(content)::text, 'UTF8')
        || decode('00', 'hex')
        || convert_to(content, 'UTF8'),
      'sha1'
    ),
    'hex'
  ) as content_git_blob_sha1
from ledger
order by version;

rollback;
