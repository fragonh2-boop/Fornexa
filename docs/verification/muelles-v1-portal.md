# MUELLES-V1 — PR-B, portal público

TASK_ID: MUELLES-V1-20261014. Base PR-A #104 `6cffac3b3bd0d2bec7c0bbcadc87e1dd9548a590`. Portal separado en `feat/muelles-v1-portal` y apilado sobre `feat/muelles-v1-core` para que su diff y revisión sean independientes. Ninguna migración aplicada remotamente, ni carga, merge o despliegue autorizado.

## Contrato y aislamiento

La capacidad opaca tiene 256 bits aleatorios; solo SHA-256 se persiste. OWNER/ADMIN emite un acceso por transportista/almacén, máximo treinta días. Expiración, revocación y membresía real vigente del emisor se comprueban en lectura y reserva. Ninguna respuesta pública incluye UUID/tenant/IDs de recursos. El administrador recibe el enlace una sola vez; no se registra ni versiona, no se envían correos/SMS/webhooks.

GET devuelve nombre/instrucciones del centro, reglas por código, plazas agregadas y citas de viajes del transportista. POST solo acepta matrícula, bultos, peso, referencia, notas, franja, código de regla, dirección y clave idempotente. Tipos estrictos, ASCII para matrícula/referencia, campos desconocidos y controles rechazados, JSON limitado a 4 KiB antes de parsear. React escapa textos. Sin ficheros, cookies de analítica ni localStorage en el portal. La telemetría de requests y referrers sustituye la capacidad por `[token]`.

La reserva exige un viaje preasignado al transportista, matrícula canónica y referencia exacta de pedido/expedición. Rechaza ambigüedad, parada incompatible, carga ADR sin habilitación, peso/longitud incompatibles, horario cerrado, HARD y suspensión por no-show; WARNING permanece visible. Conserva el vehículo/conductor en el viaje y las cantidades declaradas en la auditoría. La auditoría identifica `source_channel=PORTAL`, sin atribuir al administrador la acción del tercero.

Un lock de almacén serializa con las reservas/configuración internas; el EXCLUDE con buffer es la segunda barrera. La idempotencia guarda la respuesta original y no genera otra auditoría. Ante respuesta interrumpida el cliente conserva payload y clave idénticos hasta resolver el reintento.

## Enforcing gate

Una RPC service-role usa la telemetría privada existente, locks ordenados por token/IP, 20 peticiones por minuto/token y 60/IP, bloqueo tras cinco fallos en quince minutos. IP siempre HMAC en estos eventos, nunca en claro. La captura best-effort no puede forjar eventos que activen este gate. Sin identidad confiable o secreto dedicado el portal responde 503.

**Pendiente antes de habilitarlo:** configurar `FORNEXA_DOCK_PORTAL_HASH_SECRET` (64 caracteres hex aleatorios, separado del secreto de telemetría) y usar un ingress que sobrescriba los headers de IP. Rotarlo invalida los contadores existentes durante la ventana corta; no hacerlo durante una incidencia. No se han creado secretos o variables remotas. La retención existente es oportunista; estas pruebas no acreditan un cron garantizado ni seguridad de infraestructura externa.

## Evidencia local

- 233 tests: validadores, controles/tipos/límites, tokens/hash, identidad HMAC, JSON limitado/UTF8, disponibilidad y redacción de telemetría.
- Typecheck; lint 0 errores y 13 avisos heredados; build estándar con Manrope real y configuración intacta.
- `node scripts/verify-dock-portal-postgres.mjs /absolute/path/to/pg/lib/index.js` contra PostgreSQL local desechable `127.0.0.1:55439`: migraciones, RLS/FKs/permisos, EXCLUDE/buffer, carrera última plaza con dos claves y un ganador, reintento concurrente idéntico/una auditoría, ausencia UUIDs en resultado, HARD/WARNING/no-show, calendario legacy/festivo, longitud desconocida, expiración/revocación, rate/token/IP y fallos, sin IP clara, captura incapaz de forjar contadores.
- HTTP localhost sin credenciales externas: página pública 200, token corto 404, GET/POST públicos 503 fail-closed y headers no-store/no-referrer/noindex. Esta prueba no acredita una reserva HTTP válida.
- El harness recrea un **baseline canónico mínimo local**. No equivale a replay de todas las migraciones históricas ni prueba Supabase/PostgREST/autenticación HTTP. No acepta URL ni credenciales de producción.

E2E autenticado y visual sobre entorno instalado siguen pendientes. CI y revisión HIGH Claude Y DeepSeek exact-HEAD se solicitan tras abrir PR-B; Claude entregó MERGE NO sobre el HEAD inicial de PR-A; sus dos MUST se corrigieron en 6cffac3, pendiente re-revisión. DeepSeek sigue sin dictamen por presupuesto del listener. El loader propio y su rollback de eventos append-only siguen pendientes. Integración requiere DATA150 fusionada/desplegada/cargada/verificada y rebase posterior. Ningún silencio satisface un gate.
