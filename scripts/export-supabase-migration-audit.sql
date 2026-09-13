-- Read-only input for scripts/generate-supabase-migration-audit.ts.
-- The permanent audit stores only digests and counts, never these SQL payloads.
select
  m.version,
  m.name,
  cardinality(m.statements) as remote_array_elements,
  md5(m.statements::text) as array_text_md5,
  (
    select sum(length(e.statement))::integer
    from unnest(m.statements) as e(statement)
  ) as payload_chars_total,
  (
    select sum(octet_length(e.statement))::integer
    from unnest(m.statements) as e(statement)
  ) as payload_utf8_bytes_total,
  (
    select sum(length(encode(convert_to(e.statement, 'UTF8'), 'base64')))::integer
    from unnest(m.statements) as e(statement)
  ) as base64_wrapped_chars_total,
  (
    select sum(
      length(replace(encode(convert_to(e.statement, 'UTF8'), 'base64'), chr(10), ''))
    )::integer
    from unnest(m.statements) as e(statement)
  ) as base64_unwrapped_chars_total,
  (
    select sum(
      length(encode(convert_to(e.statement, 'UTF8'), 'base64'))
      - length(replace(encode(convert_to(e.statement, 'UTF8'), 'base64'), chr(10), ''))
    )::integer
    from unnest(m.statements) as e(statement)
  ) as base64_lf_total,
  (
    select count(*) filter (
      where right(encode(convert_to(e.statement, 'UTF8'), 'base64'), 1) = chr(10)
    )::integer
    from unnest(m.statements) as e(statement)
  ) as base64_elements_with_trailing_lf,
  (
    select md5(string_agg(md5(e.statement), ',' order by e.ordinality))
    from unnest(m.statements) with ordinality as e(statement, ordinality)
  ) as element_md5_sequence_md5,
  (
    select md5(
      string_agg(
        encode(convert_to(e.statement, 'UTF8'), 'base64'),
        ',' order by e.ordinality
      )
    )
    from unnest(m.statements) with ordinality as e(statement, ordinality)
  ) as base64_wrapped_sequence_md5,
  (
    select md5(
      string_agg(
        replace(encode(convert_to(e.statement, 'UTF8'), 'base64'), chr(10), ''),
        ',' order by e.ordinality
      )
    )
    from unnest(m.statements) with ordinality as e(statement, ordinality)
  ) as base64_unwrapped_sequence_md5,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'ordinality', e.ordinality,
          'payload_base64', encode(convert_to(e.statement, 'UTF8'), 'base64'),
          'payload_md5', md5(e.statement)
        )
        order by e.ordinality
      )
      from unnest(m.statements) with ordinality as e(statement, ordinality)
    ),
    '[]'::jsonb
  ) as elements
from supabase_migrations.schema_migrations as m
order by m.version;
