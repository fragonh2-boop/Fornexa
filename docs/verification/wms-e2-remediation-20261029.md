# Candidata correctiva E2 — 29 de octubre de 2026

Base: PR #145, `2f890c7` (incluye el arreglo independiente del orden M3).
Hallazgos de Claude: comentarios `6473429180` y `6475362493`.

| Hallazgo | Cambio propuesto | Evidencia requerida |
|---|---|---|
| E2-1 | Palés limitados únicamente con `max_pallets > 0`; 0 significa ilimitado | Regresiones compartidas ilimitado/límite positivo |
| E2-2 | Retención del quant por `flow_state=QUARANTINE`, conservando ID, HU, stock_status y cantidades físicas; cancelar solo la reserva ejecutada | INSPECTION preexistente, saldo 60+40, auditoría, rechazo de ejecución posterior retenida |
| E2-3 | La identidad única incluye HU; dos palés no se fusionan. Material suelto reutiliza quant. Bloqueo del bin antes de SELECT/INSERT | Dos HUs del mismo lote/bin, replay y carrera forzada de dos sesiones PG17 |
| E2-4 | RESERVED con reserva HELD propia sigue apto; bloqueo previo y merma tienen errores distintos | Regresión RESERVED |
| E2-5 | Limpieza temprana en cada job PG17, incluidos los recibos heredados | Ensayo negativo con fallo anterior al arnés |
| ORD-1 | Conservar renombres M3 de 2f890c7; replay natural 14 migraciones del tramo y cadena completa E2 | Nueva CI PG17, sin ordenar artificialmente por ledger |
| ORD-2 | Aserción de RLS en las seis hijas, además de las políticas | PG17; la habilitación viene del canonical model y del bridge anteriores |
| 145-1 | Import histórico pinado y probado contra su commit; contraste primario read-only nuevo de 41 pares contra ledger de 42 | SHA256/MD5 coincidentes; origen/fecha y preflight originales siguen sin certificación |
| 2c | Distinguir equivalencia histórica del fixture y divergencia del Git actual | Aserciones activas para ambas |

## Decisiones técnicas y límites

La ampliación de la clave de quant no modifica datos existentes: toda fila válida bajo la clave anterior también satisface la nueva. La HU forma parte de la identidad física, por lo que no se elimina `hu_id` del lookup ni se suman palés distintos a una misma fila. Los quants sueltos conservan `NULLS NOT DISTINCT`.

La merma no reduce stock físico por debajo de reservas ni selecciona una orden ajena para absorber la pérdida. Mantiene el quant y todas sus referencias; la retención de flujo impide reservar, aprobar o ejecutar ese stock hasta conciliación. El stock ya clasificado como INSPECTION/DAMAGED/etc. no se reclasifica automáticamente. Los consumidores E1 RESERVE/PICK ya comprueban `flow_state`; E2 incorpora la misma exclusión de estados retenidos y mantiene su compatibilidad previa con NULL legado.

El SQL histórico recuperado de RLS se conserva sin reescribir su contenido para hacerlo reejecutable: se aplica una vez mediante control de versiones de migración. No se propone repetir a mano sus CREATE POLICY sobre producción. La prueba certifica replay desde vacío y RLS efectivo, no idempotencia de cada script aislado.

El nuevo contraste de ledger se obtiene mediante `scripts/audit/capture-ledger-fingerprints.sql` en una transacción READ ONLY. Solo devuelve metadatos, recuentos y huellas; no DDL ni filas operativas. Corrobora el contenido de las entradas históricas emparejadas, pero no acredita retrospectivamente quién ejecutó la captura de 24-oct, su reloj ni sus métricas preflight. Ningún run ID se inventa.

Los seis casos de regresión compartidos son suplementarios a los 21 escenarios E2-130..150. La carrera adicional solo se ejecuta con dos conexiones reales en PG17; PGlite no se presenta como certificación TCP ni de replay completo. No se ha escrito en la base de datos remota ni desplegado esta candidata.

La revisión de Claude debe valorar las decisiones de modelo y el alcance suficiente de la nueva evidencia antes de dar por cerrados los MUST. La seguridad del ejecutor de auditoría de #146 se trata aparte.
