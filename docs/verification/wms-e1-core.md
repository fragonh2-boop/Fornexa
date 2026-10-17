# WMS-E1 · Núcleo operable de Almacenes · 17 octubre 2026

TASK_ID: `WMS-RESEARCH-20261017` · Fase 3 (Entrega E1). Riesgo HIGH. Base `main` `f1088a2` + `PR #115` (`5d4bc2d`), rama `feat/wms-e1-core`, worktree aislado `/private/tmp/fornexa-gemini-wms-e1`.

## 1. Alcance estricto de E1

Se implementa exclusivamente el alcance autorizado para **E1 — Núcleo operable** (§8 y Anexo A de `docs/architecture/wms-fase2-20261017.md`):

- **6 tablas nuevas**:
  1. `public.warehouse_behavior_policies` (herencia `WAREHOUSE -> OWNER -> CATEGORY -> PRODUCT` con versionado no destructivo `policy_version` + `superseded_at`).
  2. `public.warehouse_resources` (operarios, carretillas contrapesadas, retráctiles, recogepedidos, transpaletas, transelevadores AS/RS, AGV/AMR y transportadores, con certificaciones, altura y peso máximos).
  3. `public.handling_units` (LPN / SSCC-18 con vocabulario canónico de estados `STAGING_UNCHECKED`, `STAGING_CHECKED`, `STORED`, `PICKED_STAGED`, `LOADED`, `QUARANTINE`, `DAMAGED`).
  4. `public.handling_unit_contents` (contenido por lote, serie, caducidad y cantidad).
  5. `public.stock_reservations` (reservas por línea con `batch_number` y `serial_number` grabados para verificar `WMS_LOT_MISMATCH`).
  6. `public.warehouse_tasks` (cola de tareas operativas con `idempotency_key` única por tenant).
- **2 tablas existentes evolucionadas de forma no destructiva**:
  1. `public.inventory_quants`: añade `flow_state` anulable y `hu_id` anulable con FK compuesta `(tenant_id, hu_id)`. Los 150 quants históricos de `DATA150` conservan `flow_state IS NULL` y son tratados como **fail-closed** (`WMS_STOCK_NOT_LOCATED`).
  2. `public.inventory_movements`: añade `resource_id` anulable con FK compuesta `(tenant_id, resource_id)` manteniendo `operator_id` texto por compatibilidad histórica.
- **Sin tablas de E2**: `replenishment_rules` y `wms_proposals` quedan reservadas para E2 tal como exige el gate de Fase 3.

## 2. Cierre de `MUST-D1` y residual C3 (FornexaGPT)

- Las 6 tablas nuevas de E1 **y** las 2 tablas alteradas (`inventory_quants` e `inventory_movements`, que en `20261002233000_master_data_foundation.sql` tenían una política permisiva `FOR ALL`) quedan protegidas con:
  - Política RLS `tenant_read` exclusivamente `FOR SELECT TO authenticated USING (public.fornexa_has_tenant_access(tenant_id))`.
  - `REVOKE INSERT, UPDATE, DELETE ON public.<tabla> FROM anon, authenticated`.
  - Escritura exclusivamente a través de `public.fornexa_wms_action` (`SECURITY DEFINER`, `search_path = ''`, `EXECUTE` restringido a `service_role`).

## 3. Verificación previa en vivo y ensayo transaccional `BEGIN ... ROLLBACK`

Ejecutado mediante `scripts/wms/rehearse_wms_e1.ts` sobre conexión directa en modo sesión (`:5432`, verificada por `assertSessionModeEndpoint` que rechaza `:6543`), con **0 escrituras confirmadas (`committed_writes: 0`)** y recibo durable en `docs/verification/wms-e1-rehearsal-receipt.json`:

1. **Comprobación de duplicados `(tenant_id, id)` en tablas padre vivas**:
   - `warehouses`: 150 filas · **0 duplicados**
   - `warehouse_zones`: 600 filas · **0 duplicados**
   - `warehouse_bins`: 150 filas · **0 duplicados**
   - `products`: 151 filas · **0 duplicados**
   - `parties`: 299 filas · **0 duplicados**
   - `orders`: 151 filas · **0 duplicados**
   - `order_lines`: 150 filas · **0 duplicados**
   - `inventory_quants`: 150 filas · **0 duplicados**
   - `warehouse_docks`: 801 filas · **0 duplicados**
2. **Preservación del legado `DATA150`**:
   - Los 150 `inventory_quants` de `DATA150` permanecen con `flow_state IS NULL` antes y después de las operaciones del ensayo, y disparan determinísticamente `WMS_STOCK_NOT_LOCATED` (`REJ-03`) al intentar reservarlos.
3. **30 códigos canónicos `WMS_*` de §3.1 verificados en motor PostgreSQL**:
   - `WMS_ADR_INCOMPATIBLE`, `WMS_BIN_BLOCKED`, `WMS_BIN_CAPACITY`, `WMS_CONSOLIDATION_CONFLICT`, `WMS_CONTROL_PENDING`, `WMS_CROSS_WAREHOUSE_INVALID`, `WMS_DUPLICATE`, `WMS_EXPIRY_REQUIRED`, `WMS_FORBIDDEN`, `WMS_HU_NOT_CHECKED`, `WMS_HU_NOT_UNCHECKED`, `WMS_INSUFFICIENT_PICK_STOCK`, `WMS_INSUFFICIENT_STOCK`, `WMS_LABEL_MISMATCH`, `WMS_LABEL_MISSING`, `WMS_LOT_MISMATCH`, `WMS_LOT_MIX_FORBIDDEN`, `WMS_LOT_REQUIRED`, `WMS_NOT_READY_TO_LOAD`, `WMS_NOT_RESERVED`, `WMS_NO_SOURCE_STOCK`, `WMS_REPLENISHMENT_PENDING`, `WMS_RESOURCE_INCOMPATIBLE`, `WMS_STOCK_BLOCKED`, `WMS_STOCK_NOT_LOCATED`, `WMS_TASK_NOT_READY`, `WMS_TEMP_MISMATCH`, `WMS_TENANT_MISMATCH`, `WMS_VOLUME_TOLERANCE`, `WMS_WEIGHT_TOLERANCE`.
4. **Verificación post-rollback**: `post_rollback_e1_tables_in_prod = 0`. Ninguna migración ni dato ha sido confirmado en producción antes de la revisión exact-HEAD.
