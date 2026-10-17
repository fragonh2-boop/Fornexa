# Plan de Pruebas E2E Punto a Punto y Oráculo de Rechazos en Producción — FASE 5

- **TASK_ID:** `WMS-RESEARCH-20261017` (Sincronizado con `§3.1` de PR #115 `5d4bc2ddd8ecd1fb8ec4002904b37ef12ce17f8a`, `DATA150-WMS-PLAN-FASE4.md` y `CYCLE-003.md`)
- **Fecha:** `2026-10-17` (`Europe/Madrid`)
- **Autor:** Gemini (`GeminiFornexa`)
- **Coordinador:** Claude (`FornexaClaude`) · **Auditoría:** FornexaGPT (`FORNEXA-WMS-AUDIT-20261017`)
- **Contrato de referencia:** `docs/architecture/wms-fase2-20261017.md` (`HEAD: 5d4bc2ddd8ecd1fb8ec4002904b37ef12ce17f8a`, §2.7 vocabulario único de estados y §3.1 catálogo cerrado de 30 códigos `WMS_*`)

> [!IMPORTANT]
> **Vocabulario canónico único (§2.7 y §3.1 de PR #115):**
> - **`handling_units.state`:** `STAGING_UNCHECKED` · `STAGING_CHECKED` · `STORED` · `PICKED_STAGED` · `LOADED` · `QUARANTINE` · `DAMAGED`.
> - **`inventory_quants.flow_state`:** `STAGING_UNCHECKED` · `STAGING_CHECKED` · `STORED` · `RESERVED` · `PICKED_STAGED` · `LOADED` · `QUARANTINE` · `DAMAGED` · `NULL` (legado `DATA150` = *desconocido* = **fail-closed**).
> - **Roles operativos autorizados (`tenant_members.role`):** `OWNER`, `ADMIN`, `PLANNER`, `OPERATOR`. Roles sin permiso de escritura WMS: `DRIVER`, `VIEWER` (y `anon`).
> - **Dominio de verificación productiva:** `https://fornexasc.com/dashboard/almacenes`.

---

## 1. Bloque A — Pruebas Negativas de Seguridad, Permisos y Vía Exclusiva de Escritura (`MUST-D1`)

Verifica que ningún cliente autenticado pueda saltarse la máquina de estados escribiendo directamente por PostgREST (Data API) sobre las 6 tablas nuevas **ni sobre `inventory_quants` / `inventory_movements`**, ni cruzar fronteras de tenant o almacén:

| ID Caso | Superficie Atacada | Preestado | Acción Ejecutada | Código / Resultado Esperado | Postestado Exigido en BD |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`SEC-01`** | Escritura directa Data API sobre `handling_units` | HU en `state = 'STAGING_UNCHECKED'` (`label_issued_at = NULL`) | `PATCH /rest/v1/handling_units?id=eq.<hu_id>` con JWT autenticado intentando forzar `state = 'LOADED'` sin pasar por `fornexa_wms_action` | **Permiso denegado (`403` / `42501 insufficient_privilege`)** por `REVOKE INSERT, UPDATE, DELETE` a `anon, authenticated` | `handling_units.state` sigue en `STAGING_UNCHECKED`; `label_issued_at` sigue `NULL`. |
| **`SEC-02`** | Escritura directa Data API sobre `inventory_quants` | Quant en `flow_state = 'STAGING_UNCHECKED'` (o histórico con `flow_state IS NULL`) | `PATCH /rest/v1/inventory_quants?id=eq.<quant_id>` con JWT autenticado intentando cambiar `flow_state = 'STORED'` o `quantity_on_hand = 9999` | **Permiso denegado (`403` / `42501`)** (política restringida a `FOR SELECT` + `REVOKE INSERT, UPDATE, DELETE` sobre `inventory_quants`) | `flow_state` y `quantity_on_hand` intactos; los 150 quants de `DATA150` conservan `flow_state IS NULL`. |
| **`SEC-03`** | Escritura directa Data API sobre `stock_reservations`, `warehouse_tasks`, `handling_unit_contents`, `warehouse_resources`, `warehouse_behavior_policies` e `inventory_movements` | Tablas operativas WMS | `POST /rest/v1/stock_reservations` o `POST /rest/v1/inventory_movements` directo por Data API | **Permiso denegado (`403` / `42501`)** | 0 filas insertadas o modificadas fuera de RPC. |
| **`SEC-04`** | Rol sin permiso operativo (`VIEWER` / `DRIVER` / fuera del tenant) | Miembro del tenant con `role IN ('VIEWER', 'DRIVER')` o usuario no miembro | Llamada a `/api/wms/action` / `fornexa_wms_action` | **`403 Forbidden` · `WMS_FORBIDDEN`** | 0 cambios de estado; 0 movimientos creados. |
| **`SEC-05`** | Cruce de tenant (`WMS_TENANT_MISMATCH`) y cruce de almacén (`WMS_CROSS_WAREHOUSE_INVALID`) | `p_tenant` distinto al de la sesión/recurso, o `destination_bin_id` perteneciente a otro `warehouse_id` del mismo tenant | Invocar acción con `tenant_id` ajeno o `bin_id` de otro almacén | **`403` · `WMS_TENANT_MISMATCH`** y **`422` · `WMS_CROSS_WAREHOUSE_INVALID`** (reforzado además por las 23 FKs compuestas `(tenant_id, id)`) | 0 cambios en ambos tenants y almacenes. |

---

## 2. Bloque B — Oráculo Exhaustivo de Rechazos Tipados de Negocio (§3.1 Catálogo Cerrado de 30 Códigos)

Todos los códigos de esta tabla pertenecen al catálogo cerrado de `§3.1` de `docs/architecture/wms-fase2-20261017.md` validado por `tests/wms-code-catalogue.test.ts`:

| ID Test | Regla de Negocio / Invariante | Preestado en `DATA150-WMS` / `DATA150` | Acción + Payload Enviado | Código de Rechazo Esperado (§3.1) | Postestado Exigido en BD |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`REJ-01`** | **Regla de Oro de Fran #1:** Prohibido reservar/hacer picking de mercancía descargada **sin chequear** | Quant con `flow_state = 'STAGING_UNCHECKED'` y `stock_status = 'AVAILABLE'`; HU asociada con `state = 'STAGING_UNCHECKED'` (Escenario 1/2) | `RESERVE` o `PICK` sobre ese `quant_id` | **`409 Conflict` · `WMS_STOCK_NOT_LOCATED`** | 0 reservas creadas en `stock_reservations`; quant y HU siguen en `STAGING_UNCHECKED`. |
| **`REJ-02`** | **Regla de Oro de Fran #2:** Prohibido reservar/hacer picking ordinario de mercancía **chequeada en playa pero aún no ubicada (`STORED`)** | Quant con `flow_state = 'STAGING_CHECKED'` y `stock_status = 'AVAILABLE'`; HU con `state = 'STAGING_CHECKED'` (Escenario 2) | `RESERVE` o `PICK` sobre ese `quant_id` | **`409 Conflict` · `WMS_STOCK_NOT_LOCATED`** | 0 reservas creadas; exige `PUTAWAY` previo a `STORED`. |
| **`REJ-03`** | **Invariante Fail-Closed (`MUST-D3`):** Los 150 quants históricos de `DATA150` con `flow_state IS NULL` son desconocidos y **no aptos para picking** | Uno de los 150 `inventory_quants` originales de `DATA150` (`flow_state IS NULL`, `stock_status = 'AVAILABLE'`) que `DATA150-WMS` deja intactos | `RESERVE` o `PICK` sobre ese `quant_id` histórico | **`409 Conflict` · `WMS_STOCK_NOT_LOCATED`** | 0 reservas creadas; los 150 quants históricos siguen exactamente con `flow_state IS NULL`. |
| **`REJ-04`** | Prohibido ubicar (`PUTAWAY`) una HU que aún no ha superado el chequeo de entrada | HU con `state = 'STAGING_UNCHECKED'`, quant con `flow_state = 'STAGING_UNCHECKED'` | `PUTAWAY` hacia un bin `STORAGE` válido | **`409 Conflict` · `WMS_HU_NOT_CHECKED`** (y si se invoca `RECEIVE_CHECK` sobre una HU que ya no está en `STAGING_UNCHECKED`: **`WMS_HU_NOT_UNCHECKED`**) | La HU permanece en `STAGING_UNCHECKED`; el bin destino no recibe stock. |
| **`REJ-05`** | Captura obligatoria de lote a la entrada (`capture_lot_on_receipt = true`) | HU en `state = 'STAGING_UNCHECKED'` con producto `is_batch_managed = true` | `RECEIVE_CHECK` con `batch_number: null` o `""` | **`422 Unprocessable` · `WMS_LOT_REQUIRED`** | HU permanece en `STAGING_UNCHECKED`. |
| **`REJ-06`** | Captura obligatoria de caducidad a la entrada (`capture_expiry_on_receipt = true`) | HU en `state = 'STAGING_UNCHECKED'` con producto perecedero (`shelf_life_days > 0`) | `RECEIVE_CHECK` con lote válido pero `expiry_date: null` | **`422 Unprocessable` · `WMS_EXPIRY_REQUIRED`** | HU permanece en `STAGING_UNCHECKED`. |
| **`REJ-07`** | Ubicación bloqueada o inactiva | HU en `state = 'STAGING_CHECKED'`; bin destino con `is_blocked = true` | `PUTAWAY` hacia ese `destination_bin_id` | **`409 Conflict` · `WMS_BIN_BLOCKED`** | HU sigue en `STAGING_CHECKED`. |
| **`REJ-08`** | Superación de capacidad física de ubicación (`max_pallets`, `max_weight_kg`, `max_volume_m3`) | Bin destino al límite de `max_pallets` | `PUTAWAY` de una HU adicional hacia ese bin | **`409 Conflict` · `WMS_BIN_CAPACITY`** | HU sigue en `STAGING_CHECKED`; capacidad del bin intacta. |
| **`REJ-09`** | Incompatibilidad térmica o ADR en ubicación | HU de producto `FROZEN` (o `is_hazardous = true`) en `state = 'STAGING_CHECKED'` | `PUTAWAY` hacia bin en zona `AMBIENT` (o no apta ADR) | **`422 Unprocessable` · `WMS_TEMP_MISMATCH`** y **`WMS_ADR_INCOMPATIBLE`** | HU sigue en `STAGING_CHECKED`. |
| **`REJ-10`** | Prohibición de mezcla de lote en ubicación (`allow_mixed_lots_in_bin = false`) | Bin con stock existente del lote `LOT-WMS-A` y política `allow_mixed_lots_in_bin = false` | `PUTAWAY` (o `REPLENISH`) con lote `LOT-WMS-B` hacia ese mismo bin | **`409 Conflict` · `WMS_LOT_MIX_FORBIDDEN`** | El bin conserva únicamente `LOT-WMS-A`. |
| **`REJ-11`** | Conflicto de consolidación de reposiciones en modo `BY_BATCH` (Entrega E2) | Dos necesidades de reposición del mismo hueco con lotes distintos bajo `consolidation = 'BY_BATCH'` (o sin stock origen) | `REPLENISH` intentando fusionar lotes distintos (o sin stock en reserva) | **`409 Conflict` · `WMS_CONSOLIDATION_CONFLICT`** (y **`WMS_NO_SOURCE_STOCK`** si no hay stock origen) | 0 tareas mezcladas creadas. |
| **`REJ-12`** | Hueco de picking sin saldo suficiente / reposición pendiente o tarea no lista | Hueco de picking sin saldo libre con tarea `REPLENISH` aún en `PROPOSED` | `RESERVE`/`PICK` sobre el hueco sin saldo o confirmar tarea en `PROPOSED` | **`409 Conflict` · `WMS_INSUFFICIENT_PICK_STOCK` / `WMS_REPLENISHMENT_PENDING` / `WMS_TASK_NOT_READY`** | 0 reservas/extracciones sobre saldo inexistente; tarea sigue en `PROPOSED`. |
| **`REJ-13`** | Prohibido reservar o hacer picking de stock bloqueado o en cuarentena | Quant con `flow_state = 'STORED'` pero `stock_status IN ('QUARANTINE', 'DAMAGED', 'BLOCKED', 'INSPECTION')` | `RESERVE` o `PICK` sobre ese quant | **`409 Conflict` · `WMS_STOCK_BLOCKED`** | 0 unidades reservadas o extraídas. |
| **`REJ-14`** | Lote escaneado en salida distinto al reservado (`capture_lot_on_pick = true`) o línea sin reserva `ALLOCATED` | Reserva `ALLOCATED` con `batch_number = 'LOT-WMS-FEFO-01'` (o línea sin reserva activa) | `PICK` enviando `scanned_batch_number = 'LOT-WMS-OTRO'` (o `PICK` sin reserva `ALLOCATED`) | **`409` / `422` · `WMS_LOT_MISMATCH`** y **`WMS_NOT_RESERVED`** | Reserva intacta; quant no descontado. |
| **`REJ-15`** | Recurso incompatible con altura, peso o certificación requerida | Tarea en estantería de altura o ADR | Asignar/confirmar con recurso sin `max_lift_height_m`, sin certificación o en `MAINTENANCE`/`OFFLINE` | **`409 Conflict` · `WMS_RESOURCE_INCOMPATIBLE`** | Tarea no ejecutada por recurso inválido. |
| **`REJ-16`** | **Regla de Oro de Fran #3:** Prohibido etiquetar o cargar sin control de estado, peso y volumen dentro de tolerancia | HU en `state = 'PICKED_STAGED'` con control pendiente o peso/volumen fuera de `weight_tolerance_pct` / `volume_tolerance_pct` | `LABEL` o `LOAD` con control pendiente, peso fuera de tolerancia o volumen fuera de tolerancia | **`422` / `409` · `WMS_CONTROL_PENDING`**, **`WMS_WEIGHT_TOLERANCE`** y **`WMS_VOLUME_TOLERANCE`** | `label_issued_at` sigue `NULL` o HU no pasa a `LOADED`. |
| **`REJ-17`** | **Regla de Oro de Fran #4:** Prohibido cargar una HU sin etiqueta emitida (o que no esté en `PICKED_STAGED`) | HU en `state = 'PICKED_STAGED'` con `label_issued_at IS NULL` (o HU aún en `STORED`) | Acción `LOAD` sobre esa HU | **`409 Conflict` · `WMS_LABEL_MISSING`** (y **`WMS_NOT_READY_TO_LOAD`** si `state <> 'PICKED_STAGED'`) | HU permanece en su estado previo; 0 movimientos `SHIPMENT`. |
| **`REJ-18`** | **Invariante de Lectura en Carga (`MUST-D3`):** Etiqueta escaneada en muelle no coincide con la HU (`require_label_scan_on_load = true`) | HU en `state = 'PICKED_STAGED'` con `label_issued_at IS NOT NULL` y `code = 'WMS-TEST-HU-...'` (Escenario 6) | Acción `LOAD` enviando `scanned_code` vacío o distinto de `handling_units.code` | **`409` / `422` · `WMS_LABEL_MISMATCH`** | HU sigue en `PICKED_STAGED`; no pasa a `LOADED`. |
| **`REJ-19`** | Clave de idempotencia reutilizada con payload distinto (y repetición idéntica sin duplicar efecto) | Acción ya completada con `idempotency_key = 'WMS-IDEMP-01'` | 1) Reenviar misma `idempotency_key` con mismo payload → devuelve resultado previo sin duplicar filas.<br/>2) Reenviar misma `idempotency_key` con payload distinto → rechazo | **`409 Conflict` · `WMS_DUPLICATE`** cuando el payload difiere; respuesta idempotente con 0 filas nuevas cuando el payload es idéntico | Exactamente 1 movimiento y 1 transición en BD. |
| **`REJ-20`** | Concurrencia real (`SELECT ... FOR UPDATE`): dos confirmaciones simultáneas sobre el último saldo libre | Quant con `flow_state = 'STORED'` y `stock_status = 'AVAILABLE'`, saldo libre exacto `10 UN` | Lanzar **2 peticiones paralelas (`Promise.all`)** intentando reservar `10 UN` cada una con distinta `idempotency_key` | **Exactamente 1 devuelve `200 OK` y la otra `409 Conflict` (`WMS_INSUFFICIENT_STOCK`)** | `quantity_on_hand >= 0` y `available >= 0`; jamás sobre-reserva ni stock negativo. |

---

## 3. Bloque C — Recorrido Funcional Punto a Punto y Compensación Preservando Auditoría Append-Only

1. **Verificación de Inmutabilidad de `DATA150` por ID previo y posterior (`C4` + `DATA150-WMS-PLAN-FASE4.md` §4):**
   - **(a) Inmutabilidad por ID y hash de fila:** comprobar antes y después el hash por fila de cada registro prestado de `DATA150` (`products`, `warehouse_bins`, `warehouse_zones`, `trip_stops` y los **150 identificadores explícitos** de `inventory_quants` históricos).
   - **(b) `flow_state IS NULL` sobre los 150 IDs históricos concretos:** verificar que esos 150 IDs específicos de `DATA150` mantienen `flow_state IS NULL` (no como un simple `COUNT(*) WHERE flow_state IS NULL` global, sino evaluado sobre la lista explícita de los 150 IDs originales).
   - **(c) Incremento exacto del manifiesto `DATA150-WMS`:** comprobar que el delta de filas por tabla coincide exactamente con el manifiesto (`+130` en E1 y `+20` en E2), siendo fallido el lote si (a) o (b) fallan aunque (c) cuadre.
2. **Transiciones válidas extremo a extremo sobre filas `WMS-TEST-*` (`DATA150-WMS`):**
   - `RECEIVE_CHECK`: `STAGING_UNCHECKED` $\rightarrow$ `STAGING_CHECKED` (con `batch_number` y `expiry_date`), comprobando que en `STAGING_CHECKED` sigue rechazándose `RESERVE` (`REJ-02`).
   - `PUTAWAY`: `STAGING_CHECKED` $\rightarrow$ `STORED` en bin compatible con recurso válido.
   - `REPLENISH` *(en E2)*: `STORED` (reserva) $\rightarrow$ `STORED` (picking) bajo `NO`, `YES` y `BY_BATCH`.
   - `RESERVE` + `PICK`: quant `STORED` $\rightarrow$ `RESERVED` (`stock_reservations` en `ALLOCATED` con `batch_number`) $\rightarrow$ HU de salida en `PICKED_STAGED`.
   - `LABEL`: validación de estado, peso y volumen $\rightarrow$ sellado de `label_issued_at`.
   - `LOAD`: lectura coincidente `scanned_code == handling_units.code` $\rightarrow$ `LOADED` + movimiento `SHIPMENT` `COMPLETED`.
3. **Verificación en el dominio productivo (`https://fornexasc.com/dashboard/almacenes`):**
   - Renderizado real de zonas, ubicaciones, recursos, políticas, HUs en playa/almacenadas, cola de tareas y expediciones pendientes de carga; `0 console.error`; menú lateral izquierdo intacto en desktop, `701px` y móvil (`375px`); soporte de los 3 niveles de densidad visual (`compact`, `standard`, `comfortable`).
4. **Paso de Compensación Determinista (Preservando `audit_events` Append-Only):**
   - Al igual que en el protocolo de cierre de `MUELLES-SEED` (`audit_events` tiene triggers `fornexa_prevent_audit_mutation` que prohíben `UPDATE`/`DELETE`), la compensación post-prueba **no borra ni altera `audit_events`**: restaura el estado de las filas sintéticas de escenario (`WMS-TEST-*`) a su distribución nominal de los escenarios y registra el evento de cierre de prueba en `audit_events`.
