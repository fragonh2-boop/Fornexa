# `local_storage_import` — verificación live de efectos

Fecha: 2026-09-11.

## Alcance

Verificación **read-only** de los efectos de `supabase/migrations/20260812_local_storage_import.sql` sobre Supabase producción (`gqkjqhpmyejmehbuombk`). No se ejecutó DDL, no se reejecutó la migración y no se modificó historial estándar ni interno.

## Método de verificación

Se contrastó el SQL Git actual con catálogo PostgreSQL leído directamente en producción mediante consultas read-only:

- `information_schema.columns` para columnas, nullability y defaults;
- `pg_constraint` para PK, FK, UNIQUE y CHECK;
- `pg_class.relrowsecurity` y `pg_policies` para RLS y policies;
- `pg_indexes` / `to_regclass(...)` para existencia y definición de índices;
- `public.fornexa_schema_migrations` para provenance del ledger interno;
- `supabase_migrations.schema_migrations` para comprobar ausencia en historial estándar.

No se normalizaron ni alteraron objetos para realizar la comprobación: se comparó el estado catalogado de producción con los efectos declarados por el fichero Git.

## Provenance

- `20260812_local_storage_import.sql` no figura en `supabase_migrations.schema_migrations`.
- Sí figura en `public.fornexa_schema_migrations` como aplicada históricamente (`2026-08-12 20:31:30 UTC`).
- La verificación siguiente comprueba los efectos actuales del SQL Git; no convierte por sí sola el ledger interno en historial estándar ni autoriza `migration repair`.

## Efectos verificados en producción

### Tablas y columnas

Existen `public.local_storage_imports` y `public.local_storage_sync_runs` con las columnas, nullability y defaults esperados por la migración, incluyendo:

- UUID PK con `gen_random_uuid()`;
- `tenant_id` obligatorio con default explícito `'00000000-0000-4000-8000-000000000001'::uuid` (tenant piloto histórico);
- payload/summary JSONB;
- timestamps `first_seen_at`, `last_synced_at`, `started_at` con `now()`;
- contadores de sync con default `0`;
- `status` con default `RUNNING`.

El default de tenant es un dato histórico del esquema actual; esta verificación no lo presenta como patrón recomendado para nuevos tenants.

### Constraints

Confirmados:

- `local_storage_imports_pkey`;
- FK `local_storage_imports.tenant_id -> tenants(id) ON DELETE RESTRICT`;
- UNIQUE `(tenant_id, source_origin, storage_key, item_key)`;
- `local_storage_sync_runs_pkey`;
- FK `local_storage_sync_runs.tenant_id -> tenants(id) ON DELETE RESTRICT`;
- CHECK de `status` limitado a `RUNNING | COMPLETED | FAILED`.

### RLS y aislamiento tenant

RLS está activo en ambas tablas.

Cada tabla tiene policy `tenant_isolation`, `FOR ALL TO authenticated`, con:

- `USING (fornexa_has_tenant_access(tenant_id))`;
- `WITH CHECK (fornexa_has_tenant_access(tenant_id))`.

### Índices

Confirmados con definición compatible con la migración:

- `local_storage_imports_key_idx` sobre `(tenant_id, storage_key, last_synced_at DESC)`;
- `local_storage_sync_runs_started_idx` sobre `(tenant_id, started_at DESC)`;
- `parties_tenant_country_tax_unique`, UNIQUE parcial sobre `(tenant_id, country_code, tax_id)` únicamente cuando `tax_id IS NOT NULL AND btrim(tax_id) <> ''`.

### Sustitución del constraint de tax-ID heredado

El constraint previo `parties_tenant_id_country_code_tax_id_key` no existe actualmente. Por tanto, el efecto buscado por la migración —permitir múltiples masters incompletos sin tax-ID y aplicar unicidad solo cuando existe un tax-ID no vacío— está presente en producción.

## Conclusión

Los efectos de esquema y seguridad de `20260812_local_storage_import.sql` que pueden comprobarse de forma read-only están presentes y son coherentes con el fichero Git actual.

Clasificación A2 actual:

- **históricamente aplicada: sí**, respaldado por `public.fornexa_schema_migrations`;
- **efectos live: verificados**;
- **registrada en historial estándar Supabase: no**;
- **autorización para alinear historial estándar: no**.

La futura alineación de provenance sigue condicionada a un replay limpio desde una base vacía/Preview y a una propuesta explícita por versión. No se debe marcar/aplicar/reparar esta versión en producción por inferencia.
