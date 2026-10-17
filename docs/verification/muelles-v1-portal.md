# MUELLES-V1 — PR-B, portal público

TASK_ID: MUELLES-V1-20261014. Base PR-A #104 `6cffac3b3bd0d2bec7c0bbcadc87e1dd9548a590`. Portal separado en `feat/muelles-v1-portal` y apilado sobre `feat/muelles-v1-core` para que su diff y revisión sean independientes. Ninguna migración aplicada remotamente, ni carga, merge o despliegue autorizado.

## Contrato y aislamiento

La capacidad opaca tiene 256 bits aleatorios; solo SHA-256 se persiste. OWNER/ADMIN emite un acceso por transportista/almacén, máximo treinta días. Expiración, revocación y membresía real vigente del emisor se comprueban en lectura y reserva. Ninguna respuesta pública incluye UUID/tenant/IDs de recursos. El administrador recibe el enlace una sola vez; no se registra ni versiona, no se envían correos/SMS/webhooks.

GET devuelve nombre/instrucciones del centro, reglas por código, plazas agregadas y citas de viajes del transportista. POST solo acepta matrícula, bultos, peso, referencia, notas, franja, código de regla, dirección y clave idempotente. Tipos estrictos, ASCII para matrícula/referencia, campos desconocidos y controles rechazados, JSON limitado a 4 KiB antes de parsear. React escapa textos. Sin ficheros, cookies de analítica ni localStorage en el portal. La telemetría de requests y referrers sustituye la capacidad por `[token]`.

La reserva exige un viaje preasignado al transportista, matrícula canónica y referencia exacta de pedido/expedición. Rechaza ambigüedad, parada incompatible, carga ADR sin habilitación, peso/longitud incompatibles, horario cerrado, HARD y suspensión por no-show; WARNING permanece visible. Conserva el vehículo/conductor en el viaje y las cantidades declaradas en la auditoría. La auditoría identifica `source_channel=PORTAL`, sin atribuir al administrador la acción del tercero.

Un lock de almacén serializa con las reservas/configuración internas; el EXCLUDE con buffer es la segunda barrera. La idempotencia guarda la respuesta original y no genera otra auditoría. Ante respuesta interrumpida el cliente conserva payload y clave idénticos hasta resolver el reintento.

## Enforcing gate

Una RPC service-role usa la telemetría privada existente, locks ordenados por token/IP, 20 peticiones por minuto/token y 60/IP, bloqueo tras cinco fallos en quince minutos. IP siempre HMAC en estos eventos, nunca en claro. La captura best-effort no puede forjar eventos que activen este gate. Sin identidad confiable o secreto dedicado el portal responde 503.

**Configuración productiva (C11 — 15 oct):** `FORNEXA_DOCK_PORTAL_HASH_SECRET` (64 caracteres hex aleatorios, separado del secreto de telemetría) configurado en Vercel Production y Preview bajo ingress de Vercel (`x-vercel-forwarded-for`). Rotarlo invalida los contadores existentes durante la ventana corta; no hacerlo durante una incidencia. La retención existente es oportunista; estas pruebas no acreditan un cron garantizado ni seguridad de infraestructura externa.

## Evidencia local y cierre productivo (C11 — 15 oct)

- 233 tests: validadores, controles/tipos/límites, tokens/hash, identidad HMAC, JSON limitado/UTF8, disponibilidad y redacción de telemetría.
- Typecheck; lint 0 errores y 13 avisos heredados; build estándar con Manrope real y configuración intacta.
- `node scripts/verify-dock-portal-postgres.mjs /absolute/path/to/pg/lib/index.js` contra PostgreSQL local desechable `127.0.0.1:55439`: migraciones, RLS/FKs/permisos, EXCLUDE/buffer, carrera última plaza con dos claves y un ganador, reintento concurrente idéntico/una auditoría, ausencia UUIDs en resultado, HARD/WARNING/no-show, calendario legacy/festivo, longitud desconocida, expiración/revocación, rate/token/IP y fallos, sin IP clara, captura incapaz de forjar contadores.
- HTTP localhost sin credenciales externas: página pública 200, token corto 404, GET/POST públicos 503 fail-closed y headers no-store/no-referrer/noindex. Esta prueba no acredita una reserva HTTP válida.
- El harness recrea un **baseline canónico mínimo local**. No equivale a replay de todas las migraciones históricas ni prueba Supabase/PostgREST/autenticación HTTP. No acepta URL ni credenciales de producción.
- **Cierre productivo C11:** PR #105 rebasada sobre `9fea56b` en HEAD `32d6e8fbb83c6bb39be33f407910b343630598db`, aprobada en exact-HEAD por Claude Desktop y DeepSeek (0 MUST, MERGE YES, CI `38641122962` SUCCESS) y squash-merged en `main` como `96b0467a06729db60110366da2b2d739758d9205` (CI `38644240557` SUCCESS). Migración `20261014094551_muelles_v1_portal.sql` aplicada en Supabase producción (`fornexa_schema_migrations` = 40; 94 tablas en `public`, 94 con RLS activo). Producción Vercel `dpl_bXriyZvcCGKxuD4zHB5isJbRZqKG` READY con alias `fornexasc.com` y smoke verificado en producción (`/muelles/p/short` → 404, `/api/dock-portal/<token-43-invalido>` → 404 JSON con cabeceras `no-store`/`no-referrer`/`noindex`, rate limit y telemetría redactada `/api/dock-portal/[token]`, `ip=null`, `ip_hash` HMAC) (`C11_MUELLES_PORTAL_PRODUCTION_VERIFIED: YES`).
- **Pendientes posteriores:** loader/seed propio de muelles y citas con rollback por compensación respetando el guard append-only T1, recorrido E2E autenticado con reserva real sobre el esquema instalado y SHOULD opcional en `/muelles/p/[token]/page.tsx`.
