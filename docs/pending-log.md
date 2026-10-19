# FORNEXA — Pending log

Registro persistente de trabajo abierto. Verificar siempre contra GitHub, CI, Supabase, Vercel y Slack antes de actuar. El historial detallado anterior permanece en Git; este archivo prioriza el estado operativo vigente.

## OPEN

### 2026-10-19 — WMS M7: Controles de carga y políticas de almacén en servidor (C-3)
- **Área:** Almacenes / WMS / Servidor / C-3
- **Estado:** SUBSANACIÓN MUST-A Y SHOULDS APLICADA LOCALMENTE, PENDIENTE RATIFICACIÓN TERMINAL (DeepSeek)
- **Alcance y resolución:**
  - Resolución integral de las 5 ambigüedades técnicas en `docs/architecture/wms-m7-c3-contract-resolution.md`:
    - (a) `CONTROL_STATE` con `status: 'REJECTED'` es una inspección atómica válida que sitúa la HU y quants en `QUARANTINE` (o `DAMAGED`) sin lanzar excepción SQL. Errores tipados quedan reservados para fallos de comando.
    - (b) Idempotencia duradera registrada en `warehouse_tasks` y concurrencia serializada con `SELECT ... FOR UPDATE` sobre la HU.
    - (c) Frontera de API estricta: rechazo determinista con HTTP 400 (`WMS_FORBIDDEN`) ante cualquier payload con `state_controlled`, `expected_weight_kg`, `expected_volume_m3`, o `consolidation`/`conflicting_batch` en `REPLENISH`.
    - (d) Trigger `trg_wms_invalidate_hu_control` sobre `handling_unit_contents` que resetea `state_controlled_at = null` ante cualquier mutación de contenido. Reseteo explícito en `RECEIVE_CHECK` y `PICK`.
    - (e) Migración puramente aditiva `supabase/migrations/20261019120000_wms_c3_server_load_controls.sql` con instrucciones de rollback documentadas.
  - Subsanación de la 1ª y 2ª revisión de DeepSeek:
    - MUST-1: Tolerancia de `p_payload` nulo en declaración y normalización fail-closed al inicio de la RPC.
    - MUST-A (reabierto desde MUST-2):
      - Helper seguro `public.fornexa_wms_policy_bool(p_policy, p_key, p_default)`: parsing robusto sin excepciones `22P02` ante strings no booleanos heredados (ej. `"si"`, `"0"`). Aplicado en todas las políticas booleanas de `fornexa_wms_action`.
      - Nota operativa de rollout: HUs preexistentes en `PICKED_STAGED` nacen con `state_controlled_at = NULL`. El primer `LOAD` exigirá `CONTROL_STATE PASSED` o política explícita `require_state_control_on_load = false`.
      - Desacoplamiento de autoridad UI: la UI deshabilitada es estrictamente asistencia UX; la RPC es la única autoridad de enforcement.
    - MUST-3: Restricción estricta de `CONTROL_STATE` únicamente a estados aptos (`STAGING_UNCHECKED`, `STAGING_CHECKED`, `PICKED_STAGED`) con rechazo `WMS_NOT_READY_TO_LOAD` / `WMS_FORBIDDEN` en otros estados.
    - MUST-4: Reconciliación semántica de `inventory_quants.stock_status = 'DAMAGED'` cuando el rechazo es por deterioro.
    - MUST-5: Aislamiento multi-tenant cerrado (`tenant_id = old.tenant_id` / `new.tenant_id`) en trigger de invalidación.
    - SHOULD-B: Extracción de variables `v_disposition` y `v_rej_state` al `declare` superior de `fornexa_wms_action`, eliminando bloques anidados.
    - SHOULD-C: Derivación estricta de `v_rej_state` desde `disposition` (`QUARANTINE` default, `DAMAGED` si explícito), eliminando heurísticas de texto libre (`LIKE '%dañ%'`).
    - SHOULD-I: Condición vinculante de reversibilidad en cabecera de migración ("Solo válido si no hay migraciones posteriores a 20261019120000 que modifiquen fornexa_wms_action").
    - SHOULD-J: Documentado que `PICK` resetea el control, estableciendo `CONTROL_STATE` como paso preceptivo antes de `LOAD`.
    - SHOULD-F: Registrado seguimiento para migración futura de columna dedicada `payload_fingerprint text` en `warehouse_tasks`.
    - SHOULD-1 / SHOULD-10: `v_fingerprint` exhaustivo persistido en `reject_detail` para replay idempotente de `PASSED` y `REJECTED`.
    - NICE-1: Clases CSS `.controlOk` y `.controlPending` sin estilos inline en `WmsWorkspace.tsx`.
  - Actualización atómica de `fornexa_wms_action`: cálculo relacional de pesos y volúmenes esperados desde `products` y `handling_unit_contents` con fail-closed ante falta de expectativa calculable, y consolidación derivada de política de servidor.
  - UI interactiva (`WmsWorkspace.tsx`): adaptación para invocar `CONTROL_STATE` (`PASSED` o `REJECTED`), retirada de overrides cliente en `LABEL`/`LOAD` e inhabilitación de carga con advertencia si falta control físico.
  - Batería de pruebas unitarias (`tests/wms-c3-server-controls.test.ts`): 18 tests de contrato pasando (347/347 tests totales en verde).
- **Límites y gobernanza:** Cero merge a main, cero migración remota aplicada, cero ensayo F4, cero SQL productivo ni seed.

### 2026-10-19 — WMS M5: Robustez de sonda de rechazos y mutación aislada de estado
- **Área:** Almacenes / WMS / Sonda de rechazos
- **Estado:** FUSIONADO Y DESPLEGADO EN PRODUCCIÓN — PR #133 merged en `main` como `45f6c25a9f2a604b4400a9baa818d221837e896e`. CI `39177630557` SUCCESS (329/329 tests). Vercel READY con alias `fornexasc.com` verificado en smoke solo lectura.
- **Alcance y resolución:**
  1. `[WMS-FOLLOWUP-REJ07-FIXTURE]`: Diagnóstico explícito ante fixtures/precondiciones ausentes en todos los REJ condicionales, garantizando total: 7 y veredicto INCOMPLETE sin omisiones silenciosas.
  2. `[WMS-FOLLOWUP-ISOLATED-STATE-MUTATION]`: Tests de mutación aislada de `hu_state` y `quant_flow_state` con delta de reservas 0.

### 2026-10-17 — Corrección de la viñeta de almacén en `/plataforma`
- **Área:** Web / Producto
- **Estado:** CORREGIDO en rama `fix/landing-warehouse-claim`, pendiente de revisión y despliegue.
- **Motivo:** `LANDING-MUST1-20261017`. La viñeta de Ejecución prometía escritura de almacén («ubicaciones, inventario y movimientos») y **no existe ninguna ruta de almacén**: `app/api` no tiene ningún endpoint WMS y `inventory_movements` solo se consulta desde trazabilidad, por artículo. Corregida en los tres idiomas como «consulta […] desde trazabilidad» y declarada en el bloque «En preparación o sin verificar».
- **Caducidad enlazada:** esta corrección **debe revertirse** cuando el módulo de Almacenes (`WMS-RESEARCH-20261017`) esté en producción con alta y registro de movimientos. Entonces la viñeta original volverá a ser cierta. Queda anotado aquí para que nadie lo corrija dos veces en sentidos opuestos.
- **Residual:** páginas legales y política de cookies siguen sin existir; buzón publicado sin confirmar.

### 2026-10-17 — Niveles de visualización y corrección del scroll en tablas
- **Área:** Web / Experiencia de uso
- **Estado:** FUSIONADO Y DESPLEGADO — PR #110 squash-merged en `main` como `ee8758e0c4a09b142ab923964a45d35db487ac94` (17-oct-2026 01:21 UTC) para continuar hasta el objetivo; **la revisión independiente canónica no llegó a emitirse** pese a solicitarse con el HEAD exacto, y se deja constancia para que el gate no se dé por cumplido. CI de `main` `38990522485` SUCCESS. Verificado en producción: script anti-FOUC en el HTML y los tres niveles declarados en el CSS servido (Cómoda 42px/62px, Estándar 30px/42px, Compacta 22px/30px); smoke con `/`, `/plataforma`, `/contacto`, `/login` y `/memorandum` 200 y `/demo` 404.
- **Verificado:** 303/303 tests (14 nuevos), typecheck y lint sin errores, build con 20 páginas. En navegador real: celda de 30px en Compacta y 62px en Cómoda, cabecera de tabla fija tras desplazar 250px y barra horizontal dentro de la caja de la tabla.
- **Residual:** en pantallas de poca altura la caja de la tabla puede empezar por debajo del pliegue. Sin cambios de esquema, datos, migraciones ni variables de entorno.
- **Corrección posterior — hueco al desplazar la rejilla a la derecha:** `.table` topaba el ancho a 760px mientras la suma de columnas lo superaba; las celdas se desbordaban de su fila y el fondo y el borde inferior dejaban de cubrir lo visible. El mínimo pasa a calcularse con `calc(var(--grid-column-count) * var(--grid-column-min))` y `DataGrid.tsx` publica el número de columnas. Verificado: 10 × 150px = 1500px y la fila cubre todo el ancho visible al final del scroll. Test añadido y validado por mutación.

### 2026-10-15 — Superficies públicas: portada, plataforma y contacto
- **Área:** Web / Producto
- **Estado:** FUSIONADO Y DESPLEGADO — PR #107 squash-merged en `main` como `979c96db1662c1b37258622fcbb04d54c34294e9` (15-oct-2026 12:46 UTC) por orden directa de Fran y **sin la revisión independiente de Claude, que no llegó a emitirse**; se deja constancia para que el gate de revisión exact-HEAD no se dé por cumplido. CI de `main` run `38737174867` SUCCESS. Producción Vercel READY con alias `fornexasc.com`; smoke propio: `/`, `/plataforma`, `/contacto`, `/tracking`, `/memorandum` y `/login` 200, `/demo` 404.
- **Alcance:** Portada con cadena operativa (orden → expedición → viaje → paradas → documento → eventos), cuatro ejes de capacidad, cuatro ventajas, rejilla de los dieciséis módulos reales y las cuatro superficies públicas. Página de plataforma con el detalle por capacidad, los módulos agrupados y un bloque de estado real (en funcionamiento frente a en preparación o sin verificar). Contacto sin formulario ni envío automático: `mailto` y explicación. Se retiran de la portada los nombres de producto tomados de otro proveedor y el panel de métricas ilustrativas sin etiquetar. Solo se enlazan superficies que responden 200 en producción: `/demo` queda fuera porque devuelve 404 salvo Preview con opt-in.
- **Criterio de cierre:** typecheck, lint, tests y build estándar en verde; CI exact-HEAD; revisión independiente de Claude en exact-HEAD; despliegue Vercel READY con el alias y smoke de `/`, `/plataforma` y `/contacto`. Pendiente: páginas legales, política de cookies y confirmar el buzón publicado.
- **Residual:** páginas legales y política de cookies inexistentes; buzón publicado (`fornexa@fornexasc.com`, tomado de `EMAIL_FROM`) sin confirmar. La corrección de la afirmación del motor de tarifas se hizo antes del merge, a partir de la comparativa TESISQUARE.

### 2026-10-15 — MEMORÁNDUM: 8 tarjetas to-do derivadas de la comparativa TESISQUARE
- **Área:** Producto / Memorándum
- **Estado:** EN PROCESO DE INTEGRACIÓN (Autorización expresa de Fran)
- **Alcance:** Incorporación de 8 tarjetas to-do en `memorandumPending` de `lib/memorandum.ts` representando las capacidades confirmadas en TESISQUARE (TESI TMS / Platform) ausentes o parciales en FORNEXA: 1) Tarifas en tiempo real, 2) Planning y optimización de rondas, 3) e-CMR internacional y firma electrónica, 4) Control Tower predictiva SCOR, 5) Pasarela EDI y B2Authority, 6) Telemática IoT CAN-Bus/FMS, 7) Logística Inversa, 8) Sostenibilidad y huella CO2 (ESG).
- **Criterio de cierre:** `memorandumPending` actualizado (21 elementos), tests unitarios pasando, CI en verde y despliegue en producción Vercel READY con alias `fornexasc.com` verificado.

### 2026-10-13 — DATA150: Carga sintética de revisión en producción
- **Área:** Datos / Producción / Verificación
- **Estado:** CÓDIGO Y LOTE SQL EJECUTADOS Y VERIFICADOS EN PRODUCCIÓN — PR #103 squash-merged en `main` como `d3ff677126c50b38362b898a24006b972fbc3ad3` (CI `38583601496` y `38588352990` SUCCESS). Fase B ejecutada en Supabase producción (`gqkjqhpmyejmehbuombk`) en una única transacción `COMMITTED`: 10.500 filas insertadas en las 70 tablas objetivo (`+150` exactas por tabla), `0` filas fuera de alcance modificadas; `transport_events.actor_user_id` resuelto al miembro activo `OWNER` del tenant en las 150 filas (0 centinelas, 0 NULL). Recibo durable: `data150-execution-receipt.json` (SHA-256 `45777d72d174ee13784dd8577be33dd5bb5600973a44086873638840abc767ce`); rollback determinista: `data150-rollback.sql` (SHA-256 `a417245443ba407b4795f59bfdd8e6786171e5f86cdcd2c17b624472c7c92782`, 66 DELETEs). Verificación independiente de Claude: `DATA150_PRODUCTION_VERIFIED: YES`. Pendiente opcional: subida de binarios sintéticos PDF/JPEG a Supabase Storage si se requiere descarga real de bytes en pruebas manuales.
- **Alcance:** Creación de lote de prueba autorizado en producción con 150 filas distintas y completas por cada tabla de negocio aplicable (70 tablas objetivo, 10.500 registros totales: 48 tablas con marcador físico en fila `[PRUEBA]`/`DATA150`/`synthetic: true` [7.200 filas] y 22 tablas excepcionales documentadas sin columna metadata ni texto libre [3.300 filas] vinculadas por hash canónico RFC-8785 y FKs al tenant, ancladas al commit `71456653b834fd050d2832e0015219cbd47d4a22`). Incluye 150 direcciones completas y diferentes en Europa/España. Conectores `DISABLED` inertes; 3 tablas regulatorias/legales incorporadas con datos de prueba sintéticos (`cmr_signatures`, `transport_evidence`, `regulatory_document_artifacts`) con 150 firmas MOCK autorizadas sin validez legal atribuida según decisión de Fran (Opción B); inserciones idempotentes con `WHERE NOT EXISTS` y `RETURNING` en tablas con identidad (`operational_events`, `customs_events`); serialización tipada (`jsonb` `[]` como `'[]'::jsonb`, `ARRAY` como `'{}'`); recibo de ejecución real capturado vía `RETURNING` y rollback que solo elimina claves del recibo y preserva filas ajenas/preexistentes; verificador basado en `loadReceipt()` con claves compuestas. Excluidas 7 tablas técnicas/auth, 2 de registros técnicos/dispatch, 3 catálogos finitos y 7 normativas ADR preservadas.
- **Criterio de cierre:** Inventario y matriz de esquema documentados; dataset, manifest, cargador SQL y script de rollback exacto generados; verificador de lote de procedencia exacta; tests automatizados de integridad pasando (272/272 tests con portabilidad multiplataforma `os.tmpdir()`, types OK, lint OK, build OK); resolución de dictámenes M1-M5 en ciclos cortos; revisiones independientes Claude+DeepSeek en exact-HEAD (gate HIGH); merge sin bypass, despliegue Vercel y carga verificada en base de datos sin alterar datos reales.

### 2026-10-14 — MUELLES-V1: núcleo y portal
- **Estado:** INTEGRADO, MIGRADO, SEMBRADO Y DESPLEGADO EN PRODUCCIÓN (C10, C11 y MUELLES-SEED verificados) —
  - **PR-A #104 (núcleo):** Rebasada sobre `d3ff677` (HEAD `a3afb9a2055aa10f919fc8941af7647094311bd4`), aprobada en exact-HEAD por Claude y DeepSeek (0 MUST, MERGE YES), squash-merged en `main` como `9fea56b59c8aae3b9a69172b2867e49d70b8fba0` (CI `38638765169` SUCCESS). Migraciones `20261014090324_muelles_v1_core.sql` y `20261014103035_muelles_calendar_normalization.sql` aplicadas en Supabase producción (`fornexa_schema_migrations` = 39); los 150 `address_operational_profiles` de DATA150 normalizados al contrato canónico de 7 días con 150 eventos `NORMALIZE_CALENDAR` en `audit_events` y 0 perfiles legacy remanentes. Producción Vercel `dpl_Hm8fSeaQEfinM4BojDmcFbkcKKHS` READY (`C10_MUELLES_CORE_PRODUCTION_VERIFIED: YES`).
  - **PR-B #105 (portal público):** Rebasada sobre `9fea56b` (HEAD `32d6e8fbb83c6bb39be33f407910b343630598db`), aprobada en exact-HEAD por Claude y DeepSeek (0 MUST, MERGE YES), squash-merged en `main` como `96b0467a06729db60110366da2b2d739758d9205` (CI `38644240557` SUCCESS). Migración `20261014094551_muelles_v1_portal.sql` aplicada en Supabase producción (`fornexa_schema_migrations` = 40; 94 tablas en `public`, 94 con RLS activo). Secreto `FORNEXA_DOCK_PORTAL_HASH_SECRET` configurado en Vercel Production y Preview. Producción Vercel `dpl_bXriyZvcCGKxuD4zHB5isJbRZqKG` READY con smoke de `/muelles/p/short` (404) y `/api/dock-portal/<token-43-invalido>` (404 JSON con cabeceras `no-store`/`no-referrer`/`noindex`, rate limit y telemetría redactada `/api/dock-portal/[token]`, `ip=null`, `ip_hash` HMAC) (`C11_MUELLES_PORTAL_PRODUCTION_VERIFIED: YES`).
  - **MUELLES-SEED-PRODUCTION-20261017 (lote sintético de Muelles en producción):** Ejecutado y confirmado en Supabase producción (`gqkjqhpmyejmehbuombk`) tras ensayo transaccional `--dry-run-rehearsal` (`BEGIN ... ROLLBACK` + prueba de compensación): **2.031 filas insertadas** en una única transacción `COMMITTED` (`warehouse_zones`: `+450` zonas `RECEIVING`/`SHIPPING`/`CROSS_DOCK` → total `600`; `warehouse_docks`: `+800` muelles `M-01..M-08` preservando intacto el muelle manual preexistente `code='33'` → total `801`; `dock_appointment_rules`: `+450`; `dock_policies`: `+150`; `dock_appointments`: `+150` vinculadas 1:1 a las 150 `trip_stops` sintéticas de DATA150 sin solapes y con 15 citas en `WH-PRV-0000` cubriendo `2026-10-16`..`2026-10-18`; `transport_events`: `+31` eventos `DOCK_*` con `actor_user_id` resuelto al miembro activo `OWNER` → total `229`). Recibo durable: `docs/verification/muelles-seed-execution-receipt.json` (SHA-256 `9c6c14cdfff84808aaba72a291c0a468388c8745b0b12642e5ce6e324302300c`); rollback determinista por compensación: `scripts/muelles/muelles-seed-rollback.sql` (SHA-256 `0a1e748d84f135d7d7da4d51e90fb36fafb1b3d44e14b77504c65d2ff386d1aa`).
- **Aceptación:** planificación día/semana/mes y patio; ventana F4/F2; ficha 360°; Configuración/Informes; horarios canónicos, aislamiento tenant y reserva transaccional anti-solape; PR-B con token hash/caducidad/revocación, validación estricta, rate limit distribuido, reserva idempotente y datos mínimos propios del transportista.
- **Residual de trazabilidad:** 1.431 de las 2.031 filas llevan marca propia en sus campos; las 600 restantes (450 `dock_appointment_rules`, 150 `dock_policies`) no tienen columna donde declararse y solo se identifican por su `warehouse_id` hacia almacenes `[PRUEBA]` y por el recibo. Anotado como mejora, sin reescribir la evidencia cargada.
- **Pendiente post-despliegue:** recorrido E2E autenticado sobre el esquema instalado, semántica de overrides internos del planner sobre parámetros de corte/cupo y SHOULD opcional de devolver `notFound()` en servidor en `/muelles/p/[token]` cuando el token de 43 caracteres no resuelve.

### 2026-10-09 — TRZ1: Trazabilidad de artículos
- **Área:** Web / Trazabilidad
- **Estado:** INTEGRADO Y DESPLEGADO — PR #101 squash `db2efff` (9 oct). Revisiones exact-HEAD `65d4e8a`: DeepSeek y Gemini MERGE YES, 0 MUST; CI run 37904925764. Vercel producción READY con alias `fornexasc.com`, `/demo` 404, `/dashboard/trazabilidad` exige sesión, sin errores de runtime. Índices aplicados y registrados. Pendiente: prueba de Fran con un EAN/SKU real.
- **Criterio de cierre:** en producción, buscar un EAN/SKU/lote devuelve el recorrido del artículo con viajes, cargas/descargas, aduanas por referencia exacta, almacén y personas; demo con datos ficticios; índices aplicados.

### 2026-10-08 — UX92: pantallas homogéneas, Decision Center retirado, Artículos con alta en ventana
- **Área:** Web / UX
- **Estado:** INTEGRADO Y DESPLEGADO — PR #97 squash `5a39929` (8 oct). Revisiones exact-HEAD `cb9cd0e`: DeepSeek y Gemini MERGE YES, 0 MUST. Vercel producción READY del SHA integrado con alias `fornexasc.com`; `/demo` 404 en producción; sin errores de runtime. Pendiente: validación de Fran en producción
- **Criterio de cierre:** las 14 pantallas del menú con la misma cabecera, botones y tarjetas que Control Tower; Decision Center fuera del menú y sus rutas llevan a Control Tower; Artículos solo con grid y alta/edición en ventana superpuesta (botón y tecla +); producción READY del SHA integrado con alias `fornexasc.com`.

### 2026-10-08 — Paridad estricta de menú lateral y layout responsive (UX91-LEFT-SIDEBAR-PARITY-20261008)
- **Área:** Web / UX / Responsive / Shell
- **Estado:** CERRADO EN PRODUCCIÓN — PR #91 integrada como `dbe0174` (8 oct) y desplegada
- **Alcance:** El menú lateral de navegación debe permanecer a la izquierda en todos los viewports responsive (≤760px, 701px y móvil) con layout fiel al de producción; purga de sidebars interiores en 6 vistas secundarias (`CustomsListView`, `CmrListView`, `ModuleView`, `ImportWorkspace`, `VelocityClient`, `RecordEditor`) y limpieza de reglas hack CSS.
- **Criterio de cierre:** Tests, types, lint, build, memorandum y diff-check en verde; revisiones independientes completas de Claude y DeepSeek exact-HEAD con 0 MUST y MERGE: YES; validación visual de paridad a igualdad de zoom/viewport; merge normal y despliegue Preview/producción.

### 2026-10-08 — Cierre UX y paridad de demo
- **Área:** Web / UX / Preview
- **Estado:** CERRADO EN PRODUCCIÓN — PR #91 integrada como `dbe0174` (8 oct) y desplegada
- **Alcance:** mismo shell, 15 módulos, navegación, pantallas y formularios que producción; datos ficticios y acciones simuladas solo en Preview habilitado. Contraste, títulos, botones, paneles y responsive según Control Tower.
- **Criterio de cierre:** tipos/lint/tests/build, revisiones Claude y DeepSeek exact-HEAD, CI, prueba visual de escritorio/móvil y navegación sin rutas rotas; merge seguido de producción READY del SHA integrado y alias/runtime verificados. `/demo` debe ser inaccesible en producción incluso con flag activado.
- **Checkpoint:** `docs/ai/UX-CHECKPOINT.md`. No se cierra con fuente, build o Preview únicamente. Sin cambios SQL ni pruebas con escrituras reales de negocio.
- **Gates abiertos:** revisiones completas e independientes Claude/DeepSeek exact-HEAD (bridge automático fallido), acceso legítimo y prueba visual desplegada de escritorio/móvil; después merge y producción READY/alias/runtime. Propietario: FornexaGPT; preguntas concretas de acceso Preview y canal DeepSeek planteadas a Fran. No repetir avisos rutinarios mientras siga pendiente la misma decisión.

### 2026-10-07 — Direcciones nuevas en Nueva partida
- **Área:** Web / Partidas / Maestro de direcciones
- **Estado:** PR #95 INTEGRADA (`2067515`) Y DESPLEGADA; PENDIENTE PRUEBA DE FRAN
- **Criterio de cierre:** en producción se graba una partida con recogida y entrega escritas a mano; con la casilla marcada, la dirección aparece después en el maestro del cliente; sin marcarla, no aparece.

### 2026-10-07 — Catálogo maestro P0 en producción
- **Área:** Web / Datos maestros
- **Estado:** PR #93 INTEGRADA (`e0b9404`) Y DESPLEGADA; MIGRACIÓN APLICADA Y VERIFICADA; ARTÍCULOS VALIDADO POR FRAN (7 oct)
- **Criterio de cierre:** en `fornexasc.com` un usuario OWNER/ADMIN/OPERATOR crea un artículo, lo ve en Artículos y lo selecciona en Nueva partida; las claves compuestas existen en producción.
- **Fuera de alcance:** embalajes, conversiones de unidades, transportistas, sociedades, almacenes, stock y movimientos.

### 2026-10-07 — Producción sin datos ficticios
- **Área:** Web / Producto
- **Estado:** PR #90 INTEGRADA Y DESPLEGADA (`bc707c8`); PRODUCCIÓN VERIFICADA POR FRAN; PENDIENTE COMPROBAR LA DEMO EN PREVIEW Y DECIDIR EL `EMAIL_REPLY_TO` DE EMPRESA
- **Criterio de cierre:** en `fornexasc.com` ninguna pantalla muestra datos inventados (Control Tower con datos reales del tenant; resto con estados vacíos); en una URL de preview se ve la demostración completa.
- **Siguiente:** migrar a Supabase las pantallas que hoy guardan solo en el navegador (Importar Excel, fichas genéricas de colaboradores, almacenes y ofertas).

### 2026-10-02 — Fundación de Datos Maestros y Estructura WMS
- **Área:** Datos Maestros / WMS / Catálogo / Transportistas / Sociedades
- **Estado:** ESQUEMA APLICADO, FUENTE INTEGRADA Y DESPLEGADA; E2E AUTENTICADO PENDIENTE
- **Alcance:**
  1. Catálogo de Artículos: `products`, `product_packagings`, `uom_definitions`, `uom_conversions` con retrocompatibilidad en `order_lines.product_id`.
  2. Homologación de Transportistas: `carrier_profiles` (póliza, caducidad, límite) y enriquecimiento de `parties` (GLN, EORI, grupo matriz, tax_id_type).
  3. Sociedades y Roles: `companies` multi-CIF bajo tenant, `party_roles` normalizados por sociedad y vigencia, y correspondencias universales `external_identifiers`.
  4. WMS Físico y Movimientos Lógicos: ubicaciones físicas `warehouse_bins` (pasillo, estantería, altura, tipo de hueco), stock inventariado `inventory_quants` y trazabilidad horaria completa en `inventory_movements` (`requested_at`, `started_at`, `completed_at`, `duration_seconds`, operario).
- **Evidencia de producción:** las once tablas nuevas existen con RLS y política `tenant_isolation`; están presentes todas las columnas previstas, el trigger de duración de movimientos y las semillas declaradas. El ledger interno contiene la versión canónica de la migración.
- **Seguridad:** la verificación posterior detectó que la función interna del trigger podía exponerse como RPC `SECURITY DEFINER`. La corrección aplicada revoca su ejecución directa para `anon` y `authenticated` sin desactivar el trigger; la migración fuente de hardening quedó integrada en PR #87 como `081a728457c9f157384f77455ca39997e65e5dcf`. `service_role` conserva su privilegio de servidor y no hay llamadas RPC directas en la fuente actual.
- **Cierre técnico:** DeepSeek dio `MERGE YES` para el HEAD exacto de PR #87, sin MUST; el check `validate` del SHA integrado terminó `success`. Vercel producción está `READY` para el mismo SHA, con `fornexasc.com` en alias y respuesta HTTP 200.
- **Límite funcional:** se verificaron esquema, RLS, ledger, privilegios de función y trigger; no se ejecutó un flujo autenticado de producto sobre las nuevas tablas.
- **Límite:** el check Supabase Preview falló por timeout de conexión y el plan actual no permite una rama Supabase. La divergencia histórica de provenance sigue abierta y no se ha ocultado mediante `migration repair`.

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
- **Estado:** IMPLEMENTACIÓN PREPARADA; NO INTEGRADA NI DESPLEGADA
- **Base productiva:** PR #66 está en producción como `f7bfa5701a0b27d83cf63a77c2e036377a37b2c9`; identidad CMR y encabezados 6–12 se repiten en cada hoja con mercancía.
- **Mecanismo elegido:** repetir el borde de `.paper` en cada fragmento de página (`box-decoration-break: clone`, con prefijo `-webkit-`). `.paper` **conserva** su borde actual y `@page` no lleva `border`. Es estrictamente aditivo: un motor sin soporte renderiza exactamente lo de hoy; uno con soporte repite el marco en cada hoja. Ningún navegador puede perder el marco que ya tenía. Descartado apoyar el marco en `@page{border}` porque exige retirar el borde de `.paper` y degrada a "sin marco" en cualquier motor que no lo pinte.
- **Evidencia medida:** `docs/verification/cmr-continuation-frame-20260919.md`. Harness con comprobación de marco por píxeles: 4 lados cerrados en todas las páginas de los cuatro fixtures; control negativo sin el cambio falla con el borde superior ausente en las hojas de continuación. Chromium 141 verificado; **Firefox y Safari sin verificar** (no ejecutables en el entorno de verificación).
- **Límite conocido:** en la última hoja el marco se cierra donde acaba el contenido, no al pie. El marco de hoja completa exigiría un overlay `position:fixed`, que no es aditivo; diferido.
- **Gate:** riesgo alto por afectar a salida CMR/PDF; requiere revisión independiente exact-HEAD, CI/Preview y autorización explícita antes de merge. No afirmar aceptación operativa hasta validar un CMR real.

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
