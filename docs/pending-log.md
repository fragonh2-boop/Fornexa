# FORNEXA — Pending log

Registro persistente de trabajo abierto. Verificar siempre contra GitHub, CI, Supabase, Vercel y Slack antes de actuar. El historial detallado anterior permanece en Git; este archivo prioriza el estado operativo vigente.

## OPEN

### 2026-10-02 — Fundación de Datos Maestros y Estructura WMS
- **Área:** Datos Maestros / WMS / Catálogo / Transportistas / Sociedades
- **Estado:** MIGRACIÓN IMPLEMENTADA; RAMA CREADA PARA CI Y DESPLIEGUE
- **Alcance:**
  1. Catálogo de Artículos: `products`, `product_packagings`, `uom_definitions`, `uom_conversions` con retrocompatibilidad en `order_lines.product_id`.
  2. Homologación de Transportistas: `carrier_profiles` (póliza, caducidad, límite) y enriquecimiento de `parties` (GLN, EORI, grupo matriz, tax_id_type).
  3. Sociedades y Roles: `companies` multi-CIF bajo tenant, `party_roles` normalizados por sociedad y vigencia, y correspondencias universales `external_identifiers`.
  4. WMS Físico y Movimientos Lógicos: ubicaciones físicas `warehouse_bins` (pasillo, estantería, altura, tipo de hueco), stock inventariado `inventory_quants` y trazabilidad horaria completa en `inventory_movements` (`requested_at`, `started_at`, `completed_at`, `duration_seconds`, operario).
- **Seguridad:** Aislamiento estricto multi-tenant con RLS en las 12 tablas nuevas mediante `fornexa_has_tenant_access()`.

### 2026-09-19 — Ratificar gobernanza de revisión y reconciliar el handoff
- **Área:** Gobernanza / Trazabilidad
- **Estado:** DECISIÓN DE FRAN PENDIENTE; CORRECCIÓN DOCUMENTAL PREPARADA
- **Evidencia:** `main` está en `14d942931fee0eaa1c8ee8d2ef5d5f4aac19ad24`, commit directo y solo documental que registra el modelo de revisión por riesgo. GitHub muestra `validate` y los dos estados Vercel en `success`; Supabase Preview falla. Antes de esta actualización, el snapshot del handoff seguía declarando `660f13fc` como main.
- **Decisión requerida:** Fran ratifica o corrige el modelo y decide su compatibilidad con la protección de ramas. La coincidencia técnica entre revisores no sustituye esa decisión.
- **Criterio de cierre:** ratificación explícita o revisión del texto, y snapshot del handoff actualizado mediante PR con evidencia de CI/despliegue proporcional. No usar esta entrada para justificar retroactivamente commits directos.

### 2026-09-11 — TLM-1 telemetría privada de plataforma
- **Área:** Plataforma / Observabilidad / Seguridad / Privacidad
- **Estado:** FIX FAIL-SAFE DESPLEGADO; CONFIGURACIÓN Y VERIFICACIÓN FINAL PENDIENTES — OTRO DISPOSITIVO/ACCESO VERCEL
- **Base productiva:** PR #68 se fusionó por squash en `c9e9b76550162c9d549803e0b02031d8716bf401`; CI main #287 terminó `success`; Vercel producción quedó READY en el mismo SHA. PR #69 cerró la reconciliación documental y `main` actual pasó a `6a17adcb6bb381b4a788008c44ed8fff199889da`, con CI #289 success y producción READY.
- **Privacidad desplegada:** requests y auth comparten `telemetryNetworkIdentity()`. Con secreto dedicado e IP disponible → `ip` + HMAC SHA-256. Sin secreto o sin IP → `ip=null` e `ip_hash=null`; ya no existe degradación a IP en claro sin hash.
- **Smoke productivo:** una petición controlada GET `/` posterior al deployment funcional creó una fila nueva en `platform_telemetry.telemetry_requests` con `ip IS NULL=true` e `ip_hash IS NULL=true`, confirmando el fail-safe mientras el secreto sigue sin configurar.
- **Revisión:** DeepSeek exact-HEAD de PR #68: MUST ninguno. Claude había aprobado el diseño; la solicitud final exact-HEAD no respondió antes del merge y se registra como excepción de gobernanza, no como aprobación exact-HEAD.
- **Acción requerida:** desde un dispositivo/sesión con acceso legítimo a configuración Vercel, configurar un `FORNEXA_TELEMETRY_HASH_SECRET` dedicado y de alta entropía y `FORNEXA_TELEMETRY_OWNER_EMAILS`; redeploy; generar tráfico controlado; comprobar IP + HMAC real, acceso `/internal/telemetry` para OWNER autorizado y 404 para no autorizados.
- **Retención residual:** `platform_telemetry.run_retention_if_due()` sigue siendo oportunista y se dispara durante capturas con throttle de una hora; no es un cron garantizado cuando no hay tráfico.
- **No hacer:** no inventar/reutilizar secretos; no introducir un bypass ni cerrar TLM-1 solo porque el fail-safe ya esté en producción.
- **Criterio de cierre:** secreto + allowlist configurados y verificados en producción, hashes nuevos observados y controles de acceso confirmados sin relajar el fail-safe.

### 2026-09-11 — Supabase Preview / provenance A2
- **Área:** Plataforma / CI / Supabase / Migraciones
- **Estado:** DIAGNOSTICADO; DRIFT DDL SOURCE-ONLY REPARADO EN `main`; 32/32 PARES CLASIFICADOS; PRODUCCIÓN SANA; RECONCILIACIÓN Y REPLAY CONTROLADO PENDIENTES
- **Evidencia:** `docs/verification/supabase-migration-provenance-20260911.md` y `docs/verification/local-storage-import-live-effects-20260911.md`.
- **Foto actual:** 34 migraciones SQL activas en Git vs 33 en `supabase_migrations.schema_migrations`; 3 versiones exactas; 29 pares de nombre/lógica con timestamps distintos; 2 Git-only; 1 remote-only. Existe además `public.fornexa_schema_migrations`, ledger histórico separado.
- **Comparación SQL corregida:** de las 30 filas estándar almacenadas como un único SQL, 16 coinciden por blob/contenido, 13 difieren y 1 es remote-only. Una revisión independiente posterior retiró correctamente el cierre **13/13**: `tariff_engine_foundation` tenía drift DDL real. Tras repararlo en Git, el contraste literal-safe confirma los otros 12 como equivalentes ejecutables.
- **Drift confirmado y reparación cerrada:** la versión ejecutada de `tariff_engine_foundation` contiene el índice único `tariff_rules_tenant_id_id_key`, antes ausente en Git pero presente en producción. Es requisito de la FK compuesta tenant-aware de `pricing_run_components`. PR #72 restauró la sentencia idempotente y añadió una prueba de orden; squash `2dbe44facc303cfe4703d72a0cf665c36c98d552`, CI #306 `success` y Vercel producción `dpl_6zZhrZ7M3nPv4XdvzgMXuhp6Nnd4` READY exact-SHA. No se ejecutó SQL ni se modificó producción/historial de migraciones.
- **Cierre literal-safe homogéneo:** el mismo comparador cubre ya los **32/32 pares**. Son 31 coincidencias de nombre y un alias manual explícito (`cmr_access_key_lifecycle` ↔ `add_cmr_access_key_lifecycle`). Las tres filas históricas con arrays de 8/20/83 elementos coinciden además elemento a elemento. Se reproducen las anclas 72/72, 8/8, 20/20, 35/35, 57/57, 4/4, 83/83 y los seis pares reabiertos.
- **Artefacto auditable:** `docs/verification/supabase-migration-content-audit-20260912.json` registra cardinalidad física remota, recuentos del comparador, caracteres vs bytes UTF-8, longitudes base64 envueltas vs sin LF, SHA-256 por sentencia de tokens tipados y agregados, MD5 calculados por Postgres y resolución del emparejamiento. El transporte fue base64 UTF-8 ordenado; se preserva primero cada payload byte a byte y después se elimina solo LF `0x0a`, sin `trim` ni equivalentes. Son gates explícitos los 2.419 LF (`191.387 = 188.968 + 2.419`) y los tres elementos con LF final (`mobile_cmr` 20; `fornexa_operational_core` 53/70). El JSON permanente no conserva SQL remoto ni payload base64 y etiqueta qué controles pueden reproducirse desde el propio artefacto. Tests regeneran los digests Git y protegen el 31+1, las anclas completas, los recuentos y los controles negativos. Validación local: typecheck, 123/123 tests, build y diff-check verdes; lint sin errores y con los siete avisos preexistentes.
- **Límite probatorio del 32/32:** corresponde a la captura registrada, no a una nueva consulta de producción. Los tests recomputan digests Git y contrastan digests remotos registrados; no reconstruyen ni recomputan independientemente el SQL remoto desde el artefacto, que no conserva payloads. `remote_array_text_md5_postgres` es metadato copiado del servidor, no validado por recálculo cliente. Renovar la evidencia remota exige captura read-only autorizada. La baseline es el último commit de migraciones al capturar; una discrepancia exige revisar/regenerar el artefacto, no implica por sí sola drift productivo.
- **Clasificación agregada:** en esa captura, los 29 pares remotos de un solo elemento están alineados tras la reparación source-only; junto con las tres migraciones históricas multi-elemento, quedan clasificados **32/32 pares Git/historial estándar**. Esto no resuelve timestamps/versiones, Git-only, remote-only ni la ruta histórica obsoleta.
- **Git-only #1:** `20260812_local_storage_import.sql` no está en historial estándar pero sí figura aplicado en el ledger interno. Sus efectos live de esquema y seguridad ya están verificados read-only contra producción: tablas/columnas/defaults, PK/FK/UNIQUE/CHECK, RLS/policies tenant-aware, índices y sustitución del antiguo unique de tax-ID. Esto prueba presencia de efectos, pero **no autoriza** alinear historial estándar sin replay.
- **Git-only #2:** `20260818_cmr_number_sequence_resync.sql` no figura aplicado en ninguno de los dos ledgers. Producción muestra `cmr_number_seq.last_value=11` y máximo sufijo CMR 2026 persistido=3; no hay evidencia actual de violación del invariante, pero no se infiere que la migración haya corrido.
- **Remote-only:** `20260817212235 cmr_canonical_model_rls_and_hardening` no está en Git ejecutable, pero su SQL exacto se recuperó de `supabase_migrations.schema_migrations.statements`. Se verificaron live sus seis políticas `tenant_isolation`, RLS del ledger interno y `search_path=''` de `fornexa_check_expedition_delivery_note_order()`.
- **Cardinalidad histórica:** `20260818_fix_order_expedition_cardinality` aparece aplicado en el ledger interno, pero el fichero actual es `.sql.obsolete` de solo comentarios. La migración activa posterior restaura defensivamente Pedido↔Expediente 1:1. Git actual no reproduce la ruta histórica exacta de producción.
- **Siguiente paso ejecutable:** preparar la reconciliación no productiva con el hardening recuperado y ambos Git-only. El replay posterior sigue cost-gated.
- **Gate de replay:** incluso tras restaurar el índice y cerrar las comparaciones pendientes, sigue siendo obligatorio un replay desde base vacía/Preview por la divergencia de versiones/ledgers, el hardening remote-only, `cmr_number_sequence_resync` no aplicado y la ruta histórica obsoleta. Verificar esquema, RLS, funciones, Pedido↔Expediente 1:1, DeCA/FISCAL, telemetría y tests antes de diseñar cualquier reparación de historial.
- **Límites:** no renombrar migraciones históricas en `main`, no rerun de SQL aplicado, no `migration repair` global, no editar historial estándar y no crear rama Supabase de pago sin `get_cost` + aprobación explícita.
- **Criterio de cierre:** replay limpio + alineación de historial revisada + Git integration deja `MIGRATIONS_FAILED` sin alterar invariantes productivos.

### 2026-09-11 — Defaults históricos de tenant en importación local
- **Área:** Multi-tenant / Integridad de datos / Seguridad
- **Estado:** BACKLOG TÉCNICO — REVISAR DESPUÉS DE A2 Y ANTES DE AMPLIAR AUTONOMÍA DE TENANTS
- **Hallazgo live:** `local_storage_imports.tenant_id` y `local_storage_sync_runs.tenant_id` mantienen el default histórico `'00000000-0000-4000-8000-000000000001'::uuid`.
- **Riesgo:** RLS protege el acceso de aplicación, pero un productor interno/service-role que inserte sin `tenant_id` explícito podría atribuir datos al tenant piloto por defecto. El default fijo no debe tratarse como invariante multi-tenant deseable.
- **Acción requerida:** auditar todos los productores/inserts de estas tablas y, en un cambio separado tras estabilizar A2, valorar eliminar el default fijo y exigir `tenant_id` explícito; acompañar con migración dedicada, tests y verificación de compatibilidad de importadores existentes.
- **No mezclar con A2:** no modificar el default dentro de una alineación de provenance o `migration repair`; es un cambio funcional/esquema independiente.
- **Criterio de cierre:** ningún flujo puede insertar sin tenant explícito, tests cubren el fallo por omisión y producción deja de depender del UUID piloto como fallback implícito.

### 2026-09-10 — DeCA: E2E autenticado sobre domicilio FISCAL canónico
- **Área:** Documentación regulatoria / CMR / Acceso público / Auth
- **Estado:** INFRAESTRUCTURA FISCAL EN PRODUCCIÓN; POST AUTENTICADO CONTROLADO PENDIENTE — OTRO DISPOSITIVO/SESIÓN
- **Base productiva:** PR #64 está fusionada en `e594b2d0ca40105c3d0c5ce41e735ddf98b21e79`; la migración `canonical_fiscal_address` se aplicó DB-first y el smoke confirmó índice parcial FISCAL, constraint bidireccional, RPC service-role only y 0 filas FISCAL creadas accidentalmente.
- **Evidencia:** `docs/verification/canonical-fiscal-address-20260910.md` documenta ejecución real `BEGIN…ROLLBACK` de la RPC create+update con 1 FISCAL canónico/activo, 2 audit_events y rollback completo.
- **Bloqueo:** el endpoint nativo DeCA exige una sesión FORNEXA real OWNER/ADMIN. No resetear credenciales, no reutilizar secretos y no fabricar usuarios, cookies o JWTs para hacer pasar el gate.
