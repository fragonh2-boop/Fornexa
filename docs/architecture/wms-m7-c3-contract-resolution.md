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
           state_controlled_by = null,
           updated_at = clock_timestamp()
     where tenant_id = coalesce(new.tenant_id, old.tenant_id)
       and id = coalesce(new.handling_unit_id, old.handling_unit_id)
       and (state_controlled_at is not null or state_controlled_by is not null);
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

---

## 3. Subsanación y Cierre de Hallazgos de Revisión DeepSeek (PR #134)

Tras la revisión independiente canónica emitida por DeepSeek (`U0BV95NCT89`, mensajes `1792368288.673279` a `1792368289.867729`), se han subsanado íntegramente los 5 MUSTs y las observaciones clave:

1. **MUST-1 (`p_payload` NULL Safety)**:
   - Declaración: `v_idem text := nullif(trim(coalesce(p_idempotency_key, case when p_payload is not null then p_payload->>'idempotency_key' else null end, '')), '');`.
   - Normalización fail-closed al inicio del bloque de ejecución: `if p_payload is null then p_payload := '{}'::jsonb; end if;`.
   - Garantiza que ninguna expresión de la RPC falle por desreferenciación nula en PL/pgSQL.

2. **MUST-2 (`require_state_control_on_load` Rollout Safety)**:
   - En la migración `20261019120000_wms_c3_server_load_controls.sql`, se incorpora una instrucción idempotente de backfill pre-rollout:
     ```sql
     update public.warehouse_behavior_policies
        set params = jsonb_set(params, '{require_state_control_on_load}', 'true'::jsonb, true)
      where params is not null
        and (params->>'require_state_control_on_load' is null or params->>'require_state_control_on_load' = '');
     ```
   - En `LABEL` y `LOAD`, la evaluación `coalesce((v_policy->>'require_state_control_on_load')::boolean, true)` falla cerrada por defecto ante configuraciones heredadas.

3. **MUST-3 (Validación de Estado de HU en `CONTROL_STATE`)**:
   - Conforme al contrato (a), la inspección física solo es admisible para unidades en playa aptas para control:
     ```sql
     if v_hu.state = 'LOADED' then
       raise exception 'WMS_FORBIDDEN';
     end if;
     if v_hu.state not in ('STAGING_UNCHECKED', 'STAGING_CHECKED', 'PICKED_STAGED') then
       raise exception 'WMS_NOT_READY_TO_LOAD';
     end if;
     ```
   - Se bloquea categóricamente la aplicación de `CONTROL_STATE` sobre HUs en `STORED`, `QUARANTINE` o `DAMAGED`.

4. **MUST-4 (Reconciliación Semántica de `stock_status` y `flow_state` en `REJECTED`)**:
   - En la rama `REJECTED`, la actualización de `inventory_quants` sincroniza ambos campos:
     ```sql
     update public.inventory_quants
        set flow_state = v_rej_state,
            stock_status = case when v_rej_state = 'DAMAGED' then 'DAMAGED' else 'QUARANTINE' end,
            updated_at = v_ts
      where tenant_id = p_tenant and hu_id = v_hu.id;
     ```
   - El estado de inventario refleja de forma exacta la condición física real (`DAMAGED` vs `QUARANTINE`), preservando la integridad del inventario de calidad.

5. **MUST-5 (Aislamiento Multi-Tenant Estricto en Trigger)**:
   - La función `fornexa_wms_invalidate_hu_control` añade filtro explícito por `tenant_id`:
     `where tenant_id = old.tenant_id and id = old.handling_unit_id` (y análogo con `new.tenant_id`), cerrando cualquier potencial fuga o ambigüedad cross-tenant.

6. **SHOULD-1 & SHOULD-10 (Idempotencia y Replay Exhaustivo)**:
   - `v_fingerprint` incorpora todos los discriminantes de la acción: `p_action`, `hu_id`, `quant_id`, `reservation_id`, `destination_bin_id`, `quantity`, `status`, `reject_code`, `reason`, `disposition`.
   - Tanto las tareas `DONE` (PASSED) como `FAILED` (REJECTED) registran `v_fingerprint` en `reject_detail`.
   - Ante una repetición idéntica de la clave con el mismo payload, la RPC responde `idempotent_replay: true` devolviendo el resultado cacheado para ambos estados, mientras que un cambio de payload bajo la misma clave levanta deterministamente `WMS_DUPLICATE`.

7. **SHOULD-4 (Diff Textual `fornexa_wms_action` contra E1)**:
   - Las únicas diferencias entre la RPC de E1 (`20261017110000_wms_e1_core.sql`) y C-3 son:
     - Variables locales auxiliares de cálculo relacional (`v_computed_weight`, `v_computed_volume`).
     - Branch de acción `CONTROL_STATE` (PASSED/REJECTED con guardas y tareas idempotentes).
     - Validación y cálculo en servidor de pesos/volúmenes y control de estado previo en `LABEL` y `LOAD`.
     - Resolución de consolidación en servidor mediante política en `REPLENISH`.
     - Reseteo explícito de `state_controlled_at/by` en `RECEIVE_CHECK` y `PICK`.
     - Cero alteraciones en las demás acciones del núcleo E1 (`PUTAWAY`, `CONFIRM_TASK`, etc.).

---

## 4. Subsanación y Cierre de la 2ª Revisión DeepSeek (MUST-A y SHOULD-B/C/I/J)

Tras la segunda revisión independiente de DeepSeek (`U0BV95NCT89`, mensajes `1792379683.273659` a `1792379684.013799`), se subsana de forma estricta:

1. **MUST-A (Parsing Seguro de Políticas Booleano y Despliegue de Rollout)**:
   - **Helper Seguro `fornexa_wms_policy_bool`**: Se erradica el casteo directo `::boolean` que provocaba excepción PostgreSQL `22P02` (`invalid input syntax for type boolean`) ante valores string heredados (ej. `"si"`, `"0"`). La función `public.fornexa_wms_policy_bool(p_policy, p_key, p_default)` captura valores vacíos o malformados y retorna el valor fail-closed `p_default` sin fallar. Se utiliza en todas las comprobaciones de políticas de `fornexa_wms_action` (`require_state_control_on_load`, `allow_cross_dock`, `require_label_scan_on_load`, `capture_lot_on_receipt`, `capture_expiry_on_receipt`, `require_resource_certification`, `allow_mixed_lots_in_bin`, `capture_lot_on_pick`).
   - **Nota Operativa de Rollout**: Pre-existentes HUs en `PICKED_STAGED` tendrán `state_controlled_at = NULL`. La primera carga (`LOAD`) fallará cerrado con `WMS_CONTROL_PENDING` a menos que los operarios registren `CONTROL_STATE PASSED` o la política de almacén establezca explícitamente `require_state_control_on_load = false`.
   - **Desacoplamiento de Autoridad UI**: Se documenta y garantiza que el botón deshabilitado en frontend es asistencia de UX; el enforcement normativo y la fuente de verdad única radica en la RPC `fornexa_wms_action`.

2. **SHOULD-B (Ámbito de Variables en `fornexa_wms_action`)**:
   - Se eliminan bloques anidados `declare` dentro de `CONTROL_STATE`. Las variables `v_disposition text;` y `v_rej_state text;` se declaran en el bloque superior de la función.

3. **SHOULD-C (Derivación Determinista sin Heurística Natural de Lenguaje)**:
   - Se elimina por completo `LIKE '%dañ%'` o cualquier sniffing sobre el texto libre de `reason`. La derivación de `v_rej_state` es estricta: si `p_payload->>'disposition'` es `DAMAGED` se asigna `DAMAGED`, en cualquier otro caso `QUARANTINE`.

4. **SHOULD-I (Condición Vinculante de Reversibilidad)**:
   - Se incorpora en la cabecera de la migración la condición explícita de rollback: la re-aplicación de la función desde E1 es válida únicamente si no existen migraciones posteriores a `20261019120000` que hayan mutado `fornexa_wms_action`.

5. **SHOULD-J (Control Obligatorio entre Picking y Carga)**:
   - Se documenta que `PICK` resetea `state_controlled_at = null`, convirtiendo a `CONTROL_STATE` en un paso operativo preceptivo antes de `LOAD`.

6. **SHOULD-F (Seguimiento de Columna Dedicada de Idempotencia)**:
   - Registrado como mejora técnica para el siguiente ciclo la creación de `payload_fingerprint text` en `warehouse_tasks` para independizar el fingerprint de repetición del campo `reject_detail`.

---

## Subsanación 3 (3ª Revisión DeepSeek `1792380433.924419`)

1. **MUST-1 (Orden de Despliegue de Backfill 2b vs RPC y Atomicidad)**:
   - La sentencia de backfill de políticas preexistentes (`require_state_control_on_load = true`) se reubica al final de `supabase/migrations/20261019120000_wms_c3_server_load_controls.sql` (sección 4), tras la definición de la función `fornexa_wms_action`.
   - Se añade nota vinculante indicando que la migración debe ejecutarse dentro de un único bloque transaccional atómico (`BEGIN ... COMMIT`), garantizando que la versión del RPC con soporte de `CONTROL_STATE` y validación de carga ya esté activa cuando las políticas empiecen a exigir el control.

2. **MUST-2 (Fallback Discriminativo en `lib/wms-loader.ts`)**:
   - En `loadWmsData`, la consulta secundaria de fallback de `handling_units` se condiciona estrictamente mediante `isHuColumnMissingError(err)` al código PostgreSQL `42703` (`undefined_column`) o a mensajes descriptivos que mencionen `state_controlled`.
   - Errores de red, de RLS (PostgreSQL `42501`) o de autenticación no activan el fallback y fallan de forma transparente sin enmascarar la causa raíz.

3. **SHOULD-2 (Validación Fail-Closed de Estado en `CONTROL_STATE`)**:
   - Se incorpora validación previa en `fornexa_wms_action`: si `upper(coalesce(p_payload->>'status', 'PASSED')) not in ('PASSED', 'REJECTED')`, la RPC lanza de inmediato la excepción tipada `WMS_FORBIDDEN`.
   - Se eliminan fallbacks tácitos a `PASSED` ante valores malformados o no reconocidos.

4. **SHOULD-7 (Gobernanza de Memorándum y Terminología)**:
   - Resumen en `lib/memorandum.ts` ajustado a "En revisión independiente de M7 (C-3)..." para reflejar con precisión que los cambios están en fase de revisión de PR y no fusionados en `main`.
   - Límites operativos redactados sin ambigüedad en `docs/ai/HANDOFF.md` y `docs/pending-log.md` ("CERO commits en main, CERO merge a main, CERO aplicación remota de migración, CERO cargas COMMITTED en producción").



