# WMS M7 · Resolución de Contrato Técnico y Arquitectura C-3

**TASK_ID**: `WMS-RESEARCH-20261017`  
**Hito**: M7 (Implementación Local C-3 · Controles de Carga y Políticas en Servidor)  
**Base**: `main 45f6c25a9f2a604b4400a9baa818d221837e896e` (Merge PR #133)  
**Autor**: Gemini (`GeminiFornexa`)  
**Revisor**: DeepSeek (`Fornexa DeepSeek Reviewer`)  
**Entradas**: `M6-C3-CONTRACT.md` (DeepSeek), `wms-c3-server-side-load-controls-proposal.md` (Gemini), instrucción `1792366867.769679` (FornexaGPT).

---

## 1. Resolución de las 5 Ambigüedades Técnicas (FornexaGPT § FASE 2)

### (a) `CONTROL_STATE` con resultado `REJECTED`: Atomicidad y Separación de Errores
- **Principio**: Una llamada válida a `CONTROL_STATE` con resultado `REJECTED` (inspección física desfavorable) **no es un fallo de comando ni una excepción SQL**; es una operación completada con éxito que certifica un defecto físico en la mercancía.
- **Comportamiento atómico**:
  - Si la llamada es sintáctica y operativamente válida (HU en estado apto `STAGING_UNCHECKED`, `STAGING_CHECKED` o `PICKED_STAGED`, tenant verificado), la transacción **no lanza excepción SQL**.
  - Transiciona la HU a `QUARANTINE` (defecto subsanable) o `DAMAGED` (deterioro terminal), según el parámetro `disposition` (por defecto `'QUARANTINE'`).
  - Actualiza `handling_units.state_controlled_at = null`, `state_controlled_by = p_actor`.
  - Sincroniza `inventory_quants.flow_state` al mismo estado de cuarentena/daño.
  - Inserta atómicamente el registro en `public.audit_events` con `action = 'CONTROL_STATE'`, `actor_user_id = p_actor`, `reason = notes` y el detalle en `before_data`/`after_data`.
  - Retorna JSON exitoso: `jsonb_build_object('ok', true, 'action', 'CONTROL_STATE', 'status', 'REJECTED', 'state', v_target_state)`.
- **Errores de comando separados**:
  - Excepciones tipadas solo se disparan ante precondiciones ausentes o violaciones de seguridad:
    - HU inexistente o de otro tenant: `WMS_FORBIDDEN`.
    - HU en estado no inspeccionable (ej. `LOADED`): `WMS_NOT_READY_TO_LOAD` / `WMS_HU_NOT_UNCHECKED`.
- **Preservación del catálogo**:
  - El catálogo de 30 códigos cerrados de §3.1 se preserva intacto. Si con posterioridad un operario intenta ejecutar `LABEL` o `LOAD` sobre una HU en cuarentena/daño o sin control previo, el servidor rechaza con `WMS_CONTROL_PENDING` o `WMS_NOT_READY_TO_LOAD`.

### (b) Idempotencia Duradera y Concurrencia en `CONTROL_STATE`
- **Idempotencia duradera**:
  - `CONTROL_STATE` registra una fila en `public.warehouse_tasks` con `task_type = 'CONTROL_STATE'`, `state = 'DONE'`, `hu_id = v_hu.id`, `started_at = v_ts`, `completed_at = v_ts` y `idempotency_key = v_idem` (derivado de `p_idempotency_key`).
  - Al reutilizar la clave de idempotencia existente (`unique(tenant_id, idempotency_key)`), llamadas duplicadas con la misma clave detectan la tarea previa y devuelven el resultado cacheado sin mutar de nuevo la base de datos ni duplicar `audit_events`.
- **Concurrencia**:
  - Al inicio de `CONTROL_STATE`, `LABEL` y `LOAD`, se ejecuta `select * from public.handling_units where id = v_hu_id and tenant_id = p_tenant for update;`.
  - Esto garantiza bloqueo exclusivo a nivel de fila durante la transacción, impidiendo que dos operarios concurrentes sobrescriban marcas de estado en carrera.

### (c) Rechazo Determinista en API y Servidor (Cero Ambigüedad)
- **Frontera de Entrada (API `app/api/wms/route.ts`)**:
  - La API rechaza de forma determinista con **HTTP 400** (`WMS_FORBIDDEN`) si el cliente envía campos de autoridad del servidor:
    - `state_controlled`
    - `expected_weight_kg`
    - `expected_volume_m3`
    - `consolidation` (en acción `REPLENISH`)
    - `conflicting_batch` (en acción `REPLENISH`)
  - Se erradica por completo la alternativa ambigua de "ignorar silenciosamente".
- **Frontera del Servidor (RPC `fornexa_wms_action`)**:
  - Los esperados se calculan o leen exclusivamente del modelo relacional:
    - `expected_weight_kg`: `v_hu.gross_weight_kg`; si es nulo o $\le 0$, se calcula desde $\sum(\text{quantity} \times \text{products.gross\_weight\_kg})$ en `handling_unit_contents`.
    - Si la política exige control y no hay peso esperado calculable ($> 0$), **falla cerrado** con `WMS_WEIGHT_TOLERANCE` (no omite).
    - Mismo criterio para volumen: `v_hu.volume_m3`, con respaldo en $\sum(\text{quantity} \times \text{products.volume\_m3})$, fallando con `WMS_VOLUME_TOLERANCE` si no es calculable.
    - `v_consolidation`: extraído estrictamente de `v_policy->>'consolidation'`. El servidor comprueba en base de datos si la ubicación de destino contiene lotes divergentes (`exists` en `inventory_quants`), rechazando con `WMS_CONSOLIDATION_CONFLICT`.

### (d) Invalidación Completa del Control de Calidad
- **Trigger de invalidación automática**:
  - Se implementa el trigger `trg_wms_invalidate_hu_control` sobre `public.handling_unit_contents`.
  - Ante cualquier `INSERT`, `UPDATE` o `DELETE` de líneas de contenido, se ejecuta:
    ```sql
    update public.handling_units
       set state_controlled_at = null,
           state_controlled_by = null
     where id = coalesce(new.hu_id, old.hu_id)
       and state_controlled_at is not null;
    ```
  - Falla cerrado por diseño: cualquier alteración de la carga física anula inmediatamente la vigencia del control previo.
- **Acciones operativas que invalidan**:
  - `RECEIVE_CHECK` y `PICK` resetean explícitamente `state_controlled_at = null, state_controlled_by = null`.
- **Excepciones explícitas de política**:
  - `require_state_control_on_load = false`: configuración legítima a nivel de almacén o propietario que desactiva la obligatoriedad.
  - Cross-docking: solo se autoriza bypass si la política activa explícitamente `allow_cross_dock = true` y la unidad proviene de un muelle de entrada hacia expedición directa. No existe exención global no parametrizada.

### (e) Estrategia de Rollout y Rollback Seguro
- **Migración nueva e independiente**:
  - Archivo: `supabase/migrations/20261019120000_wms_c3_server_load_controls.sql`. No se altera la migración de fundación E1 (`20261017110000_wms_e1_core.sql`).
  - Columnas añadidas a `handling_units`:
    - `state_controlled_at timestamptz`
    - `state_controlled_by uuid references auth.users(id) on delete set null` (evitando la tabla inexistente `profiles`).
- **Compatibilidad**:
  - Columnas nulables; los registros existentes inician con control `null`, requiriendo paso por `CONTROL_STATE` antes de expedir si la política lo exige.
- **Procedimiento de Rollback**:
  - 1. Drop trigger `trg_wms_invalidate_hu_control` en `handling_unit_contents`.
  - 2. Drop función `wms_invalidate_hu_control()`.
  - 3. Restaurar la definición de `fornexa_wms_action` previa.
  - 4. Drop columnas `state_controlled_at` y `state_controlled_by` de `handling_units`.
  - 5. Reversión de código en frontend/API.
  - 6. Auditoría preservada: los registros de `audit_events` generados no se eliminan.

---

## 2. Matriz de Aceptación Local (16 Casos M6)

| # | Escenario de Prueba | Comportamiento Esperado | Verificación |
|---|---|---|---|
| 1 | `LOAD` con `state_controlled: true` inyectado en payload | API rechaza con HTTP 400; sin control en BD $\to$ `WMS_CONTROL_PENDING` | Automatizado |
| 2 | `LABEL` con `expected_weight_kg` manipulado | API rechaza con HTTP 400; servidor usa únicamente esperado de BD | Automatizado |
| 3 | `LABEL`/`LOAD` con esperado incalculable y política estricta | Falla cerrado con `WMS_WEIGHT_TOLERANCE` o `WMS_VOLUME_TOLERANCE` | Automatizado |
| 4 | `LOAD` con peso medido fuera de tolerancia | Rechazo estricto `WMS_WEIGHT_TOLERANCE` | Automatizado |
| 5 | `LOAD` con volumen medido fuera de tolerancia | Rechazo estricto `WMS_VOLUME_TOLERANCE` | Automatizado |
| 6 | `CONTROL_STATE` `PASSED` sobre `PICKED_STAGED` | Marca `state_controlled_at/by` + auditoría; `state` intacto | Automatizado |
| 7 | `CONTROL_STATE` sobre HU en estado `LOADED` | Rechazo con `WMS_NOT_READY_TO_LOAD` | Automatizado |
| 8 | `CONTROL_STATE` `REJECTED` | Transición a `QUARANTINE` o `DAMAGED` + auditoría sin excepción SQL | Automatizado |
| 9 | `CONTROL_STATE` repetido con misma `idempotency_key` | Idempotente: devuelve resultado sin duplicar marcas ni auditoría | Automatizado |
| 10 | Dos `CONTROL_STATE` concurrentes | Bloqueo `FOR UPDATE`: resolución secuencial atómica | Automatizado |
| 11 | Mutación de contenidos tras el control | Trigger invalida `state_controlled_at` poniéndolo a `null` | Automatizado |
| 12 | `REPLENISH` con `consolidation` en payload | API rechaza con HTTP 400; servidor evalúa política real | Automatizado |
| 13 | Política con `require_state_control_on_load = false` | Carga autorizada sin control previo | Automatizado |
| 14 | Cross-docking autorizado por política | Flujo directo permitido conforme a configuración | Automatizado |
| 15 | HU perteneciente a otro tenant | Rechazo estricto `WMS_FORBIDDEN` | Automatizado |
| 16 | Fallo en inserción de `audit_events` | Rollback transaccional íntegro sin marcas huérfanas | Automatizado |
