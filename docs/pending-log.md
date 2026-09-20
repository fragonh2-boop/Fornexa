# FORNEXA — Pending log

Registro persistente de trabajo abierto. Verificar siempre contra GitHub, CI, Supabase, Vercel y Slack antes de actuar. El historial detallado anterior permanece en Git; este archivo prioriza el estado operativo vigente.

## OPEN

### 2026-09-20 — CMR: eliminar datos demo del flujo real de emisión
- **Área:** CMR / Integridad documental / Validación
- **Estado:** CORRECCIÓN EN RAMA; ALTO RIESGO; SIN MERGE NI DEPLOY
- **Hallazgo:** `/dashboard/epod-cmr/nuevo` inicializaba una expedición, partes, vehículo y carga ADR UN 1263 ficticios. Esos valores satisfacían la validación cliente y habilitaban emitir un documento legal sin seleccionar datos operativos.
- **Corrección preparada:** el borrador nace vacío y al 0%; UI y `POST /api/cmr` comparten una única regla de completitud, con expedición obligatoria, viaje obligatorio cuando ese es el origen, campos legales, Customer ID y régimen ADR condicional. La expedición en origen Viaje ya era un invariante del endpoint, que devolvía 422 sin ella; ahora la UI lo anticipa. Los valores compuestos solo por espacios no cuentan como completos.
- **Aceptación:** tests cubren borrador vacío, flujo completo, origen viaje, ADR y botón de emisión fail-closed; ejecutar suite, typecheck, lint, build y memorandum diff-check. Después, CI y revisiones Claude + DeepSeek deben aprobar el mismo HEAD exacto antes de cualquier merge.
- **Fuera de alcance:** la propagación canónica de etiquetas ADR desde `hazmat_entries.label_codes` queda como cambio separado; no fusionar, desplegar ni describir esta corrección como productiva mientras siga en rama.

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
- **Fixture:** no reutilizar `CMR-E2E-MOBILE-20260819`; carece de relaciones canónicas sender/carrier y datos de vehículo. Usar un fixture explícitamente sintético y aislado.
- **Acción requerida:** con sesión OWNER/ADMIN legítima, ejecutar POST productivo y verificar 201, PDF nativo, Storage privado, artifact/version/hash/size, token público almacenado solo como SHA-256, resolución pública sin credenciales, hash descargado y lifecycle.
- **Límites:** M8, eCMR signing/auth/jurisdiction y lifecycle operativo automático siguen separados.

### 2026-09-11 — eCMR: identidad, firma e integridad probatoria
- **Área:** Producto / Documentación electrónica / Legal-tech / Seguridad
- **Estado:** BACKLOG PRIORITARIO DESPUÉS DE A2; DISEÑO E IMPLEMENTACIÓN SEPARADOS DE DeCA
- **Objetivo:** definir identidad/autenticación del firmante, evidencia de consentimiento/firma, integridad o sellado del documento, timestamp/evidencia, jurisdicción aplicable y lifecycle de estados/documentos sin mezclarlo con M8 ni con el E2E DeCA pendiente.
- **Regla:** no presentar una firma dibujada o un login como firma electrónica suficiente por sí mismos; diseñar evidencia verificable y una cadena de integridad explícita.
- **Siguiente paso:** auditoría del modelo actual de `cmr_signatures`, evidencias Mobile y rutas CMR; producir propuesta de modelo/casos de uso y revisión jurídica/técnica antes de migraciones.

### 2026-09-11 — ADR 2025: activación del maestro regulatorio
- **Área:** ADR / Mercancías peligrosas / Datos maestros
- **Estado:** BACKLOG; FUENTE OFICIAL Y REGLAS PENDIENTES DE VALIDACIÓN
- **Base:** fundación ADR e índices están desplegados; no activar cálculo regulatorio con datos incompletos.
- **Siguiente paso:** contrastar fuente oficial ADR 2025, empaquetados/instrucciones y reglas necesarias; preparar importación versionada y tests antes de activar búsquedas/cálculo como fuente normativa operativa.

### 2026-09-11 — Control Tower con fuente única tenant-aware
- **Área:** BI / Operación / Multi-tenant
- **Estado:** BACKLOG
- **Objetivo:** identificar widgets/KPIs aún demo/mock y sustituirlos por datos operativos trazables con aislamiento tenant, definición de fuente y cálculo reproducible.
- **Criterio:** ningún KPI productivo debe mezclar tenants ni mostrar datos ficticios como reales.

### 2026-09-11 — Canal estable de Mobile
- **Área:** Mobile / Release / CI-CD
- **Estado:** BACKLOG
- **Objetivo:** formalizar promoción, versionado, distribución y trazabilidad de Android más allá del canal interno, preservando compatibilidad API y evidencias de build.

### 2026-09-10 — CMR: marco físico de hojas de continuación
- **Área:** CMR / Impresión-PDF / UX
- **Estado:** MEJORA VISUAL OPCIONAL; CONTINUIDAD E INTEGRIDAD CERRADAS
- **Base productiva:** PR #66 está en producción como `f7bfa5701a0b27d83cf63a77c2e036377a37b2c9`; identidad CMR y encabezados 6–12 se repiten en cada hoja con mercancía.
- **Mejora pendiente:** valorar un marco físico explícito por cada hoja de continuación. Tratarlo como refinamiento cosmético independiente, sin reabrir no-clipping, integridad, repetición de `thead` ni contrato A4.

### 2026-09-05 — QR visible y listo antes de imprimir/exportar CMR
- **Área:** CMR / QR / Impresión-PDF / UX
- **Estado:** INTEGRADO Y DESPLEGADO; VALIDACIÓN NATIVA CON QR REAL SIGUE SEPARADA — OTRO DISPOSITIVO/SESIÓN
- **Cierre técnico:** PR #52 bloquea imprimir/exportar hasta que el QR exacto carga; fallo representado sin imagen rota y retry sin relajar expiración/revocación.
- **Pendiente de aceptación:** validar desde dispositivo/navegador apropiado un PDF/diálogo nativo con QR real y un CMR operativo. La evidencia sintética de paginación no sustituye esta aceptación.

### 2026-09-04 — MMO-1 ejecución Preview controlada
- **Área:** IA / Orquestación / Seguridad
- **Estado:** BACKLOG — REQUIERE CONFIGURACIÓN PREVIEW AISLADA
- **Evidencia:** PR #38 sigue draft y separada del flujo productivo actual.
- **Bloqueo:** configurar variables server-side exclusivamente para Preview; Production debe permanecer sin flag activo ni claves de proveedores.
- **Después:** una ejecución sobre `public_code`, revisión de salida sanitizada, retirada de route/page/flag temporal, nuevo CI/Preview, revisión final y merge condicionado.

### 2026-09-11 — Autonomía de tenants
- **Área:** Producto / Multi-tenant / Gobernanza
- **Estado:** BACKLOG FUNCIONAL
- **Objetivo:** definir alta/configuración autónoma de nuevas organizaciones y límites operativos de OWNER/ADMIN sin relajar aislamiento multi-tenant.

## DONE

### 2026-09-14 — A2: clasificación literal-safe integrada (PR #74)
- **Estado:** FUSIONADA Y DESPLEGADA; A2 GLOBAL SIGUE OPEN.
- **Evidencia:** squash `660f13fc931d96ec75d47ef59b1bb58be6c554cc`; CI `34785352766` success; Vercel `dpl_9UvQg7bM1SnDUT8ZwjyKoQG5Ef5d` READY exact-SHA con alias `fornexasc.com`. Home y dashboard renderizados en Edge; revisión visual de dashboard, sin cambios de datos. Sin entradas warning/error/fatal en la ventana runtime comprobada (13 septiembre 21:46–22:01 UTC).
- **Gobernanza:** DeepSeek aprobó HEAD final `27294f973d433d0b95c0fd867f1e33bbad473a91`, MUST ninguno. La revisión previa de Claude no equivale a aprobación del HEAD final enmendado. Seguimiento documental `codex/a2-audit-closeout` incorpora cuatro SHOULD, todavía separado de este cierre productivo.
- **Alcance:** cierra los pares antes reabiertos, incluido operational core; no cierra provenance, ledgers ni replay. No se aplicó SQL ni se alteró historial Supabase.

### 2026-09-12 — A2: restauración source-only del índice tarifario
- **Estado:** PR #72 INTEGRADA; CI Y VERCEL PRODUCCIÓN VERDES; SIN MUTACIÓN DE SUPABASE
- **Cierre:** Git vuelve a contener `tariff_rules_tenant_id_id_key` antes de la FK compuesta que lo requiere. Claude verificó el HEAD exacto con MUST ninguno; DeepSeek no respondió y no se contabiliza como aprobación. El cierre repara la fuente y su prueba preventiva, no la divergencia global de provenance. Las comparaciones entonces reabiertas se cerraron posteriormente en PR #74; el replay controlado continúa en OPEN.

### 2026-09-11 — Contraste de recuperación de contraseña
- **Estado:** VALIDADO; NO REQUIERE CAMBIO VISUAL
- **Cierre:** el mensaje de éxito actual usa `#14532d` sobre `#ecfdf3`; la relación de contraste calculada es 8,64:1, superior a WCAG AA para texto normal y también al umbral AAA de 7:1. El pendiente era obsoleto; no se cambian colores innecesariamente.

### 2026-09-11 — TLM-1: fail-safe de IP sin secreto
- **Estado:** PR #68 INTEGRADA, DESPLEGADA Y VERIFICADA; TLM-1 GLOBAL SIGUE ABIERTO POR CONFIGURACIÓN
- **Cierre técnico:** el código ya no persiste IP en claro cuando falta el secreto dedicado. PR #68 → `c9e9b76550162c9d549803e0b02031d8716bf401`; CI #287 success; Vercel producción READY exact-SHA; runtime limpio en la ventana comprobada; smoke productivo GET `/` confirmó `ip=null` + `ip_hash=null`. La entrada OPEN anterior conserva el gate de secreto + allowlist.

### 2026-09-10 — CMR: identidad y cabeceras repetidas en hojas de continuación
- **Estado:** PR #66 INTEGRADA, DESPLEGADA Y VERIFICADA
- **Cierre:** squash `f7bfa5701a0b27d83cf63a77c2e036377a37b2c9`; CI #282 success; Vercel producción READY exact-SHA. Mercancías 6–12 usan tabla semántica con `thead` repetible. Harness Chromium 144.0.7559.96: normal 2 líneas→1 página; 42→3/42 de 42; fila larga→3/42 de 42/sin hoja vacía; 80→4/80 de 80. Marco físico queda como mejora cosmética separada.

### 2026-09-10 — Domicilio FISCAL canónico para documentación regulatoria
- **Estado:** PR #64 INTEGRADA, MIGRADA Y DESPLEGADA
- **Cierre:** migración DB-first, índice/constraint/RPC verificados, sin crear filas FISCAL. PR #64 fusionada y desplegada; DeCA exige FISCAL activo explícito y edición FISCAL queda OWNER/ADMIN.

### 2026-09-10 — CMR sin clipping silencioso en contenido extremo
- **Estado:** PR #62 INTEGRADA, DESPLEGADA Y VERIFICADA
- **Cierre:** A4 conserva contenido extremo mediante paginación sin clipping; verificación Chromium preservó mercancías, ADR, bloques inferiores y firmas.

### 2026-09-09 — Reviewer DeepSeek: protocolo MAIN vs PR
- **Estado:** PRS #8, #9 Y #10 DEL REPOSITORIO DEL REVIEWER INTEGRADAS
- **Cierre:** reviewer separa MAIN/PR, admite estado de repo y mantiene independencia read-only.

### 2026-09-08 — Recuperación del reviewer DeepSeek en Slack
- **Estado:** PRS #6 Y #7 INTEGRADAS
- **Cierre:** triggers HEAD/deduplicación corregidos y DeepSeek V4 Pro operativo sin ampliar permisos.

### 2026-09-08 — CMR firmas y geometría A4
- **Estado:** PRS #59 Y #60 INTEGRADAS Y DESPLEGADAS
- **Cierre:** firmas 22–24 vinculadas a partes/evidencias reales y aprovechamiento A4 corregido; PR #62 añadió paginación extrema.

### 2026-09-07 — DeCA P0-A / P0-B
- **Estado:** INTEGRADO Y DESPLEGADO
- **Cierre técnico:** lifecycle mínimo público corregido y generador PDF DeCA nativo/emisión atómica incorporados. E2E, M8, lifecycle automático y eCMR siguen como gates separados.

### 2026-09-05 — Login recuperable tras fallo transitorio de cliente
- **Estado:** INTEGRADO Y PRESENTE EN PRODUCCIÓN
- **Cierre:** un fallo de inicialización Supabase cliente ya no queda cacheado para toda la pestaña; un intento posterior vuelve a cargar configuración/red.

### 2026-09-04 — Regresión visual del logotipo de acceso
- **Estado:** INTEGRADA Y VERIFICADA EN PRODUCCIÓN
- **Cierre:** viewport/overflow SVG corregido y protocolo UX reforzado para evidencia visual desplegada.

### 2026-09-03 — CMR interno, QR e impresión
- **Estado:** PRS #44–#47 INTEGRADAS Y VERIFICADAS EN PRODUCCIÓN
- **Cierre:** acceso tenant-aware, QR interno seguro y exportación A4 sin chrome del dashboard.

### 2026-09-03 — DeCA-1 fundación documental
- **Estado:** IMPLEMENTADO, MIGRADO Y DESPLEGADO
- **Cierre:** tipos/scope controlados, artefactos PDF inmutables y tokens públicos con lifecycle separado.

### 2026-09-03 — T1 histórico operativo append-only
- **Estado:** IMPLEMENTADO, MIGRADO Y DESPLEGADO
- **Cierre:** eventos solo lectura/inserción para roles de aplicación; correcciones mediante eventos compensatorios.
