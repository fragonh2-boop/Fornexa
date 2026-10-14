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

## Integración

NO INTEGRADO / NO DESPLEGADO / NO CARGADO. Cero SQL remoto. #103 y su carril no se han modificado. CI exact-HEAD y revisiones completas Claude Y DeepSeek con 0 MUST se solicitan tras abrir la PR; este documento no las declara concedidas.

Antes de integrar: #103 fusionada → desplegada → carga verificada → rebase → seed propio/recibo/rollback → nuevos checks y revisiones exact-HEAD. El portal público va en PR-B separada, y el E2E autenticado se ejecutará cuando exista un entorno autorizado con este esquema.
