-- scripts/audit/capture-supabase-migration-audit.sql
-- Canonical READ-ONLY capture script for Supabase Database Audit.
-- Approved in PREVIEW-CANDIDATE5-GEMINI-20261024.md:89-262 and REVIEW-PREVIEW-CANDIDATE5-ARGON-20261024.md.
-- STRICT FAIL-CLOSED DISCIPLINE:
-- 1. BEGIN TRANSACTION READ ONLY; guarantees the PostgreSQL engine rejects any write (ERROR 25006).
-- 2. Terminated strictly with ROLLBACK; ensuring 0 mutations can ever be persisted.
-- 3. Fail-safe to_jsonb(t)->>'tenant_id' prevents SQLSTATE 42703 if column is absent.

\set ON_ERROR_STOP 1
SET statement_timeout = '30s';
SET lock_timeout = '10s';

BEGIN TRANSACTION READ ONLY;

-- 1. CONSULTA AGREGADA A: Métricas agregadas de public.customs_messages
-- Fail-safe ante ausencia de columna: to_jsonb(m)->>'tenant_id' previene SQLSTATE 42703
SELECT 
    to_jsonb(m)->>'tenant_id' AS message_tenant_id,
    c.tenant_id AS case_tenant_id,
    count(*)::bigint AS total_rows,
    min(m.created_at) AS min_created_at,
    max(m.created_at) AS max_created_at
FROM public.customs_messages m
LEFT JOIN public.customs_cases c ON c.id = m.case_id
GROUP BY to_jsonb(m)->>'tenant_id', c.tenant_id
ORDER BY to_jsonb(m)->>'tenant_id', c.tenant_id;

-- 2. CONSULTA AGREGADA B: Métricas agregadas de public.customs_events
-- Fail-safe ante ausencia de columna: to_jsonb(e)->>'tenant_id' previene SQLSTATE 42703
SELECT 
    to_jsonb(e)->>'tenant_id' AS event_tenant_id,
    c.tenant_id AS case_tenant_id,
    count(*)::bigint AS total_rows,
    min(e.created_at) AS min_created_at,
    max(e.created_at) AS max_created_at
FROM public.customs_events e
LEFT JOIN public.customs_cases c ON c.id = e.case_id
GROUP BY to_jsonb(e)->>'tenant_id', c.tenant_id
ORDER BY to_jsonb(e)->>'tenant_id', c.tenant_id;

-- 3. CONSULTA AGREGADA C: Métricas agregadas de public.customs_cases (Tabla Padre)
SELECT 
    tenant_id,
    count(*)::bigint AS total_rows,
    min(created_at) AS min_created_at,
    max(created_at) AS max_created_at
FROM public.customs_cases
GROUP BY tenant_id
ORDER BY tenant_id;

-- 4. COHERENCIA REFERENCIAL CRUZADA PADRE-HIJO
-- Fail-safe ante ausencia de columna: evalúa to_jsonb(m|e)->>'tenant_id'
SELECT 
    'customs_messages_cross_tenant_check' AS check_name,
    count(*)::bigint AS mismatched_rows
FROM public.customs_messages m
JOIN public.customs_cases c ON c.id = m.case_id
WHERE (to_jsonb(m)->>'tenant_id') IS NOT NULL 
  AND c.tenant_id IS NOT NULL 
  AND (to_jsonb(m)->>'tenant_id')::uuid <> c.tenant_id;

SELECT 
    'customs_events_cross_tenant_check' AS check_name,
    count(*)::bigint AS mismatched_rows
FROM public.customs_events e
JOIN public.customs_cases c ON c.id = e.case_id
WHERE (to_jsonb(e)->>'tenant_id') IS NOT NULL 
  AND c.tenant_id IS NOT NULL 
  AND (to_jsonb(e)->>'tenant_id')::uuid <> c.tenant_id;

-- 5. CATÁLOGO DEL ESQUEMA: Existencia, tipo, nulabilidad y defaults
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('customs_messages', 'customs_events', 'customs_cases')
  AND column_name IN ('tenant_id', 'actor_id', 'case_id')
ORDER BY table_name, column_name;

-- 6. CATÁLOGO DE CONSTRAINTS Y POLÍTICAS RLS EN AMBAS TABLAS
SELECT 
    conrelid::regclass::text AS table_name,
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.customs_messages'::regclass, 'public.customs_events'::regclass)
ORDER BY table_name, constraint_name;

SELECT 
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('customs_messages', 'customs_events')
ORDER BY tablename, policyname;

-- 7. EXPORTACIÓN CANÓNICA DEL LEDGER
-- Genera exactamente el JSON en una sola línea requerido por generate-supabase-migration-audit.ts
SELECT coalesce(jsonb_agg(row_to_json(q) ORDER BY q.version), '[]'::jsonb)::text AS migration_audit_export
FROM (
  SELECT
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
  FROM supabase_migrations.schema_migrations as m
) q;

ROLLBACK;
