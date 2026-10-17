# MUELLES-V1 · núcleo · 14 octubre 2026

TASK_ID: MUELLES-V1-20261014. Riesgo HIGH. Base `a51e469`, rama `feat/muelles-v1-core`, worktree aislado `/tmp/fornexa-codex-muelles`.

## Alcance y decisiones

La cita reserva un recurso y referencia la parada/pedido/expedición. No duplica matrículas, remolques, conductores, transportistas ni KPI. Se añade una tabla de políticas con quince defaults explícitos; la configuración de horarios sigue en el perfil de dirección. La fuente HTML citada tiene cuatro pantallas y once parámetros: el encargo añade ficha, informes y portal; los cuatro parámetros adicionales se toman de la propuesta funcional (corte/máximo de cambios, cupo último minuto, compensación).

No se permite forzar un solape físico: el EXCLUDE obligatorio prevalece sobre el ejemplo del mockup. Provisional/espera no asignan muelle ni consumen capacidad. La configuración de avisos queda persistida; este cambio no envía correo, SMS ni webhooks. No se añaden cargas reales ni seeds de negocio en esta PR.

La disponibilidad del cliente es orientativa; RPC serializa por almacén, vuelve a comprobar capacidad y compatibilidad de la regla y EXCLUDE impide el conflicto real. Los cambios de cita, eventos y auditoría son atómicos. La versión tiene precisión de milisegundos para conservar comparación exacta en JavaScript. El cambio de buffer de un muelle recalcula las reservas dentro de la misma transacción y falla si introduce conflicto.

`transport_events` admite una cita anterior a CMR mediante FK compuesta y contrato DOCK con autor obligatorio. El resto de eventos conserva la exigencia de CMR. La constraint nueva es NOT VALID para no reclasificar retroactivamente la historia existente, pero protege todas las inserciones nuevas. Los controles append-only existentes no se alteran. El check-in/check-out sincroniza el estado/tiempo real de la parada enlazada; el futuro seed no lo hace.

## Evidencia local

- `pnpm typecheck`: PASS.
- `pnpm lint`: cero errores; trece avisos existentes en archivos ajenos al cambio inicial (comprobar el resultado del HEAD final).
- `pnpm test`: 227/227 PASS, con validadores canónicos, festivos, DST, buffer, reservas que no consumen capacidad y KPI desde eventos.
- `pnpm build`: PASS con configuración estándar, sin bypass ni cambios de fonts/config.
- PostgreSQL 18 local en puerto dedicado: `node scripts/verify-docks-postgres.mjs /absolute/path/to/pg/lib/index.js`. Solo acepta driver local y conecta a `127.0.0.1:55439`; no acepta URL remota. Usa un esquema de prueba desechable con dependencias canónicas mínimas y ejecuta la migración completa. PASS de EXCLUDE directo, buffer, adyacencia, concurrencia (un ganador), RLS entre tenants, FK cruzada rechazada, permisos de cliente, autor obligatorio, rollback de auditoría, versión obsoleta y quince defaults.
- Harness de componentes compilado fuera del producto, con HTTP sintético y un almacén `[PRUEBA]`: inspección de Gantt, alta, configuración; F4 mantiene la ventana, F2 guarda/cierra, Escape devuelve el foco. Ventana desktop y móvil con controles accesibles/barra de acciones. La navegación lateral compartida añade Muelles tras Almacenes; no se modifica el shell.

El harness se elimina del árbol versionado. No hay cookies/JWT ni credenciales de producción en estas pruebas. No es E2E autenticado de Supabase ni aceptación visual de una Preview desplegada. El harness usa el font asset del build; la geometría se comprobó con tamaños de viewport del navegador y su zoom vigente.

## Integración y cierre productivo (C10 — 15 oct)

INTEGRADO, MIGRADO Y DESPLEGADO EN PRODUCCIÓN:
- **Rebase y revisiones:** Rebasado sobre `d3ff677` (DATA150) en HEAD `a3afb9a2055aa10f919fc8941af7647094311bd4`. Aprobado en exact-HEAD por Claude Desktop y DeepSeek (0 MUST, MERGE YES), CI `38632744106` SUCCESS.
- **Merge y CI de `main`:** PR #104 squash-merged como `9fea56b59c8aae3b9a69172b2867e49d70b8fba0` (CI `38638765169` SUCCESS).
- **Migraciones en Supabase producción (`gqkjqhpmyejmehbuombk`):** Aplicadas `20261014090324_muelles_v1_core.sql` y `20261014103035_muelles_calendar_normalization.sql` (`fornexa_schema_migrations` = 39). Los 150 `address_operational_profiles` de DATA150 quedaron normalizados al contrato canónico de 7 días con 150 eventos `NORMALIZE_CALENDAR` en `audit_events` y 0 perfiles legacy remanentes.
- **Despliegue Vercel:** Producción `dpl_Hm8fSeaQEfinM4BojDmcFbkcKKHS` READY con alias `fornexasc.com`, verificado independientemente por Claude (`C10_MUELLES_CORE_PRODUCTION_VERIFIED: YES`).
- **Lote sintético propio de Muelles en producción (`MUELLES-SEED-PRODUCTION-20261017` — 17 oct):** Ejecutado y confirmado en Supabase producción (`gqkjqhpmyejmehbuombk`) tras ensayo `--dry-run-rehearsal` (`BEGIN ... ROLLBACK` + prueba de compensación). Insertadas **2.031 filas** en una única transacción `COMMITTED` (`warehouse_zones`: `+450` → `600`; `warehouse_docks`: `+800` → `801`, preservando intacto el muelle manual preexistente `code='33'`; `dock_appointment_rules`: `+450`; `dock_policies`: `+150`; `dock_appointments`: `+150` vinculadas 1:1 a las 150 `trip_stops` sintéticas de DATA150 sin solapes y con 15 citas en `WH-PRV-0000` cubriendo `2026-10-16`..`2026-10-18`; `transport_events`: `+31` → `229`). Recibo durable: `docs/verification/muelles-seed-execution-receipt.json` (SHA-256 `9c6c14cdfff84808aaba72a291c0a468388c8745b0b12642e5ce6e324302300c`); rollback determinista por compensación: `scripts/muelles/muelles-seed-rollback.sql` (SHA-256 `0a1e748d84f135d7d7da4d51e90fb36fafb1b3d44e14b77504c65d2ff386d1aa`).
- **Alcance real de la trazabilidad del lote:** 1.431 de las 2.031 filas llevan marca propia en sus campos (`[PRUEBA]` en los nombres, `MUELLES-SEED` en los payloads de evento). Las **600 restantes** —450 `dock_appointment_rules` y 150 `dock_policies`— no tienen columna de metadatos ni texto libre donde declararse: se identifican por su `warehouse_id`, que apunta a almacenes `[PRUEBA]`, y por el recibo, que enumera sus identificadores y permite borrarlas con el rollback. `dock_policies.parameters` es `jsonb` y podría haber llevado el identificador de lote. Queda anotado como mejora para futuros lotes; no se reescribe la evidencia ya cargada.

## Corrección HIGH R2 (14 oct)

Claude identificó dos MUST en 827fefe: lista de direcciones bloqueada por horarios legacy y edición RPC que permitía entrar a patio sin eventos. La migración de normalización convierte solo formatos conocidos con imágenes completas antes/después en auditoría y cambia el default. Lectura de calendario desconocido marca esa dirección sin ocultar el resto; PUT omitiendo el calendario conserva el valor. La entrada a patio solo se admite por `fornexa_dock_action`.

PostgreSQL local verifica la normalización y sus imágenes, re-ejecución sin auditoría duplicada, default de siete días, rechazo de transición sin efectos, PLANNER operativo sin configuración, mantenimiento bloqueado y buffer de histórico terminal intacto. 228 tests y checks estándar PASS. Los índices únicos nuevos en tablas existentes permiten FKs compuestas tenant/entidad; no duplican entidades. El snapshot SQL sigue siendo mínimo, no replay histórico.

Fran autorizó PLANNER como OPERATOR en esta tarea. Los parámetros de antelación/corte/máximo de cambios/cupo del planner no se automatizan todos todavía: falta definir cómo permitir las excepciones operativas internas; la antelación y el horizonte del portal sí se aplican. No hay envío real de notificaciones. El seed propio de muelles/citas con compensación de eventos (guard T1 intacto) ya quedó cargado y verificado en producción; queda pendiente el recorrido E2E autenticado.
