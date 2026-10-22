# WMS M7 · Resolución de Contrato Técnico y Arquitectura C-3

## Decisiones vigentes de negocio — 21 oct 2026

Estas decisiones sustituyen las exigencias anteriores de medición nueva y exclusividad del destino descritas en las notas históricas de este documento.

- Peso/volumen: basta el dato vigente de SGA, heredado de la creación de partida o editado posteriormente, también con `require_weight_measurement` / `require_volume_measurement` activos. La ausencia total de un valor válido continúa rechazándose si la política lo exige. Un dato heredado no recibe marcas de medición física ni un contraste artificial de desviación cero. Las entradas explícitas conservan su validación de tolerancia y procedencia.
- Varias órdenes de preparación pueden reservar desde el mismo origen hacia el mismo destino de picking/preparación. Se conserva `order_id` por tarea y se controla el saldo agregado; no se rechaza por la mera existencia de otra tarea pendiente. La política de consolidación sigue siendo de servidor.
- Casos 17–20 del arnés: 100→60+40 / 60+60, mismo o diferente destino; FK entre tenant y quant y CHECK de saldo; SGA editado sin nueva medición; consolidación de reservas entrantes. En PostgreSQL16 el caso17 usa dos sesiones TCP con barrera de bloqueo. PGlite solo aporta un ensayo complementario secuencial para ese caso.
- El recibo JSON de CI #537 ha sido archivado en `docs/verification/historical/receipt-m7-c3-postgres-ci537.json` y es estrictamente no certificante del HEAD actual (MUST-T1). La certificación activa vigente es el artefacto emitido dinámicamente por el contenedor de PostgreSQL 16 sobre el commit ejecutado (`docs/verification/receipt-m7-c3-postgres.json`, con 20 casos derivados dinámicamente del arnés, MUST-T2). El arnés declara `full_production_migration_chain=false`: prueba las migraciones WMS y las restricciones de saldo/estado pertinentes sobre un esquema maestro parcial; no certifica toda la base de producción. Los contadores distinguen ejecución de certificación por motor.
- El runner nunca confirma desde PGlite ni emite `COMMITTED_LIVE`. Un apply sobre un destino permitido exige evidencia persistida antes de COMMIT y registra el SQL ejecutado en el ledger. Producción sigue excluida de este runner; su ejecución exige un plan separado revisado.


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

## 2. Matriz histórica M6 (16 casos; ampliada a 20 arriba)

| # | Escenario de Prueba | Comportamiento Esperado | Tipo de Verificación Actual |
|---|---|---|---|
| 1 | `LOAD` con `state_controlled: true` inyectado en payload | API rechaza con HTTP 400; sin control en BD $\to$ `WMS_CONTROL_PENDING` | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 1) + Test Unitario |
| 2 | `LABEL` con `expected_weight_kg` manipulado | API rechaza con HTTP 400; servidor usa únicamente esperado de BD | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 2) + Test Unitario |
| 3 | `LABEL`/`LOAD` con esperado incalculable y política estricta | Falla cerrado con `WMS_WEIGHT_TOLERANCE` o `WMS_VOLUME_TOLERANCE` | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 3) + Test Unitario |
| 4 | `LOAD` con peso medido fuera de tolerancia | Rechazo estricto `WMS_WEIGHT_TOLERANCE` | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 4) + Test Unitario |
| 5 | `LOAD` con volumen medido fuera de tolerancia | Rechazo estricto `WMS_VOLUME_TOLERANCE` | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 5) + Test Unitario |
| 6 | `CONTROL_STATE` `PASSED` sobre `PICKED_STAGED` | Marca `state_controlled_at/by` + auditoría; `state` intacto | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 6) + Test Unitario |
| 7 | `CONTROL_STATE` sobre HU en estado `LOADED` | Rechazo con `WMS_FORBIDDEN` | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 7) + Test Unitario |
| 8 | `CONTROL_STATE` `REJECTED` | Transición a `QUARANTINE` o `DAMAGED` + auditoría sin excepción SQL | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 8) + Test Unitario |
| 9 | `CONTROL_STATE` repetido con misma `idempotency_key` | Idempotente: devuelve resultado sin duplicar marcas ni auditoría | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 9) + Test Unitario |
| 10 | Dos `CONTROL_STATE` concurrentes | Bloqueo `FOR UPDATE`: resolución secuencial atómica | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 10) + Test Unitario |
| 11 | Mutación de contenidos tras el control | Trigger invalida `state_controlled_at` poniéndolo a `null` | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 11) + Test Unitario |
| 12 | `REPLENISH` con `consolidation` en payload | API rechaza con HTTP 400; servidor evalúa política real | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 12) + Test Unitario |
| 13 | Política con `require_state_control_on_load = false` | Carga autorizada sin control previo | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 13) + Test Unitario |
| 14 | Cross-docking autorizado por política | Flujo directo permitido conforme a configuración | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 14) + Test Unitario |
| 15 | HU perteneciente a otro tenant | Rechazo estricto `WMS_FORBIDDEN` | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 15) + Test Unitario |
| 16 | Fallo en inserción de `audit_events` | Rollback transaccional íntegro sin marcas huérfanas | Relacional PostgreSQL (`receipt-m7-c3-postgres.json` Case 16) + Test Unitario |

### Distinción Técnica y Entorno Local:
- **Aserción Estática de Contrato (`tests/wms-c3-server-controls.test.ts`)**: 26 pruebas unitarias en Node.js que verifican tipos TypeScript, exports, parsing de políticas booleanas, orden de ejecución en migraciones, rechazos en ruta API y guards de control.
- **Harness de Ejecución Relacional Local (`scripts/wms/verify-c3-postgres.mjs`)**: Ensayo relacional complementario aislado con `@electric-sql/pglite`; su versión real se registra en el recibo y no se equipara al PostgreSQL 16 TCP de CI.
- **Recibo Durable**: Generado y persistido en `docs/verification/receipt-m7-c3-postgres.json` registrando versión, SHA, preestado, postestado y aserción de cada caso (16/16 PASS).

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

---

## 5. Subsanación 4 (4ª Revisión DeepSeek y Cierre Integral de MUST-1..4 y SHOULD-1)

Tras la revisión de DeepSeek en el hilo de Slack sobre el HEAD `9a0ae20374e1fe86078fcdcde47f8b942e9a481d` (dictamen: MERGE NO, 4 MUSTs, 2 SHOULDs, 2 NICEs) y la instrucción canónica de FornexaGPT (`1792382033.349359` / `1792382254.686159`), se subsanan de manera estricta y verificable todos los puntos:

1. **MUST-1 (Ejecución Relacional en PostgreSQL Local con Datos Sintéticos y Recibo Durable)**:
   - Se implementó un arnés de ejecución relacional autónomo en `scripts/wms/verify-c3-postgres.mjs` utilizando `@electric-sql/pglite` (PostgreSQL 16 en WebAssembly).
   - Se ejecutó la migración completa `20261019120000_wms_c3_server_load_controls.sql` sobre un esquema aislado, sembrando datos sintéticos limpios y ejecutando los 16 casos con medición estricta de preestado y postestado.
   - Recibo generado en `docs/verification/receipt-m7-c3-postgres.json` con 16/16 casos PASS, timestamp, versión y hash.

2. **MUST-2 (Estrategia de Rollback Protegido sin Reabrir Bypass E1)**:
   - Se creó el script `supabase/migrations/rollback/20261019120000_wms_c3_rollback_protected.sql`.
   - Se documentó la reversión en dos niveles:
     - Nivel 1 (Operativo, Cero DDL): actualización de `warehouse_behavior_policies` fijando `require_state_control_on_load = false` y `require_weight_measurement = false`.
     - Nivel 2 (RPC Protegido): desactiva la obligatoriedad de `CONTROL_STATE` pero **mantiene el cómputo seguro de peso/volumen esperado en servidor** y la consolidación por política, sin aceptar parámetros manipulados del payload del cliente.
     - Preserva las columnas `state_controlled_at/by` y `measured_at/by` como nulables, evitando bloqueos de DDL, drop destructivos de datos o reapertura de vectores de usurpación.

3. **MUST-3 (Estado `status` Estrictamente Obligatorio en `CONTROL_STATE`)**:
   - Se eliminó cualquier fallback o presunción a `PASSED`. La RPC evalúa:
     ```sql
     v_control_status := upper(nullif(trim(p_payload->>'status'), ''));
     if v_control_status is null or v_control_status not in ('PASSED', 'REJECTED') then
       raise exception 'WMS_FORBIDDEN';
     end if;
     ```
   - La omisión de status o el envío de valores vacíos/inválidos falla cerrado de forma determinista con `WMS_FORBIDDEN`.
   - El fingerprint de idempotencia incluye `trim(status)` normalizado, previniendo divergencias en retransmisiones (NICE-1).

4. **MUST-4 (Medición Física Obligatoria y Persistencia de Trazabilidad)**:
   - Se añadieron a `handling_units` las columnas `measured_at timestamptz` y `measured_by uuid references auth.users(id) on delete set null`.
   - En `LABEL` y `LOAD`, cuando la política exige el dato de peso o volumen, el dato vigente de SGA es suficiente; solo su ausencia total produce `WMS_WEIGHT_TOLERANCE` o `WMS_VOLUME_TOLERANCE`. Las entradas explícitas se validan frente a tolerancias sin exigir una medición nueva universal.
   - Al registrarse mediciones válidas dentro de tolerancia, la RPC persiste atómicamente `measured_at = v_ts` y `measured_by = p_actor` en `handling_units`.
   - `lib/wms.ts` y `lib/wms-loader.ts` se sincronizan para exponer y consumir estas columnas con discriminación estricta de errores (`isHuColumnMissingError`).

5. **SHOULD-1 (Trigger de Invalidación Extendido a Mutaciones de Quants)**:
   - Se implementó el trigger `trg_wms_invalidate_hu_control_quants` sobre `public.inventory_quants` ante mutaciones de `hu_id`.
   - Cualquier reasignación de un quant entre unidades de manipulación resetea atómicamente `state_controlled_at = null`, `state_controlled_by = null`, `measured_at = null`, `measured_by = null` tanto en la HU origen (`old.hu_id`) como en la HU destino (`new.hu_id`).

---

## 6. Subsanación 5 (5ª Revisión DeepSeek sobre HEAD `9d63d5c` — MUST-1, MUST-5, SHOULD-1, SHOULD-2)

Tras la revisión independiente de DeepSeek del commit `9d63d5c9887e1f8a485eafccfa8034c49aef6042` (dictamen: MERGE NO, 2 MUST, 2 SHOULD, 2 NICE; ver `review-134-9d63d5c/REVIEW-DEEPSEEK-9d63d5c.md` y `GEMINI-NEXT-TASK.md`), se implementan las subsanaciones definitivas:

1. **MUST-1 (Reproducibilidad, Hashes Criptográficos, Concurrencia Real de 2 Sesiones y CI)**:
   - **Dependencia Reproducible**: `@electric-sql/pglite` se integra en `package.json` (`devDependencies`) y queda registrado en `pnpm-lock.yaml`, asegurando compilación y ejecución idéntica sin rutas locales temporales.
   - **Trazabilidad Criptográfica del Recibo**: `docs/verification/receipt-m7-c3-postgres.json` registra `base_sha` (`45f6c25a...`), `migration_sha256`, `rollback_sha256`, `harness_sha256` y la versión exacta de PostgreSQL obtenida vía `SELECT version();`.
   - **Concurrencia Real de 2 Sesiones**: El caso 10 ejecuta una prueba de contención real con dos clientes concurrentes en PostgreSQL; la sesión 1 adquiere un bloqueo exclusivo de fila mediante `SELECT ... FOR UPDATE` en transacción abierta, la sesión 2 queda físicamente bloqueada en la barrera del motor relacional, y se desbloquea atómicamente tras el `COMMIT` de la sesión 1, serializando la auditoría.
   - **Automatización CI**: Se añade en `.github/workflows/ci.yml` el servicio de base de datos `postgres:16-alpine` y la ejecución automatizada del arnés de verificación relacional en GitHub Actions.

2. **MUST-5 (Aislamiento de Host Local y Base de Datos Desechable)**:
   - Se incorpora la función `validateIsolation({ host, database })` en `scripts/wms/verify-c3-postgres.mjs`.
   - Valida antes de cualquier conexión DDL que el host sea estrictamente loopback (`127.0.0.1`, `localhost`, `::1`) y prohíbe de forma tajante bases de datos de producción o del sistema (`postgres`, `production`, `prod`, `defaultdb`, `fornexa`, `supabase`). Requiere el uso de una base de datos desechable dedicada (`fornexa_test`), abortando la ejecución con `[SECURITY_FATAL MUST-5]` en caso contrario.

3. **SHOULD-1 (Ejecución Real de API Web con Request y Verificación de HTTP 400)**:
   - Se modulariza la validación en `lib/wms.ts` mediante `validateWmsActionPayloadSecurity` y `executeWmsActionApi(request, authContext, rpcExecutor)` consumiendo el estándar Web `Request` / `Response`.
   - En `tests/wms-c3-server-controls.test.ts` se añaden pruebas dinámicas ejecutando llamadas HTTP reales contra `executeWmsActionApi`, verificando la emisión de HTTP 400 (`WMS_FORBIDDEN`) y la ausencia total de efectos secundarios ante intentos de inyectar `state_controlled`, `expected_weight_kg`, `expected_volume_m3`, o anular la consolidación de `REPLENISH`.

4. **SHOULD-2 (Definición del Rollback Nivel 2 como Apagado Operativo Fail-Closed)**:
   - Se documenta con claridad que la ejecución del script SQL de rollback protegido (`supabase/migrations/rollback/20261019120000_wms_c3_rollback_protected.sql`) funciona de forma deliberada como un **interruptor de apagado operativo fail-closed (`WMS_ROLLBACK_ACTIVE`)**.
   - Ante una emergencia donde deba anularse la versión C-3 sin reabrir el vector de usurpación de autoridad cliente de E1, el rollback rechaza con excepción toda operativa de almacén hasta el despliegue del parche correctivo, preservando intactas las columnas y el histórico de auditoría sin corrupción de datos.

---

## 7. Subsanación 6 (6ª Revisión DeepSeek tras dictamen `d8a0ec2` — MUST-1 residual, MUST-5 pre-DDL, y Captura UI)

Tras la revisión de DeepSeek en `review-134-9d63d5c/REVIEW-DEEPSEEK-d8a0ec2.md` y su adenda correspondiente:

1. **MUST-1 residual (Publicación Durable del Recibo en CI y Coherencia de Modelo)**:
   - **Artefacto CI Automatizado**: Se añade el paso `actions/upload-artifact@v4` en `.github/workflows/ci.yml` inmediatamente tras la ejecución relacional de PostgreSQL, publicando duraderamente `docs/verification/receipt-m7-c3-postgres.json` en los artefactos de la ejecución de GitHub Actions (`name: receipt-m7-c3-postgres`).
   - **Coherencia Título-Modelo en Caso 10**: En `scripts/wms/verify-c3-postgres.mjs`, se discrimina de forma explícita el título y los metadatos devueltos por el caso 10:
     - En ejecución con conexión de socket TCP a PostgreSQL (`pg-socket` en CI): `title = "Dos sesiones TCP concurrentes se serializan con FOR UPDATE y contención real"`, `model = "real_two_tcp_sessions_row_lock_barrier"`, `concurrency_certified: true`.
     - En ejecución con PGlite en memoria (`pglite-wasm` local): `title = "Dos llamadas concurrentes en bucle de eventos (simulación en PGlite WASM; contención real certificada en CI PostgreSQL 16)"`, `model = "event_loop_concurrent_dispatch"`, `concurrency_certified: false`.
   - **Aislamiento de Recibo Local**: Las ejecuciones locales en modo WASM escriben en `docs/verification/receipt-m7-c3-pglite.json` (ignorado en `.gitignore`), protegiendo el archivo de recibo relacional acreditante `docs/verification/receipt-m7-c3-postgres.json` generado por PostgreSQL 16.

2. **MUST-5 (Prueba de Destino Desechable Previa a DDL Destructivo)**:
   - Se incorpora `validateDisposableDatabase(dbClient, type)` en `scripts/wms/verify-c3-postgres.mjs`, ejecutada **antes** de emitir cualquier sentencia `DROP SCHEMA public CASCADE`.
   - Para conexiones de base de datos relacional externa, la función consulta `information_schema.tables` en el esquema `public`.
   - Si existen tablas de usuario preexistentes y **no** contienen la tabla de marca sintética (`public.fornexa_synthetic_test_marker`), la ejecución aborta inmediatamente con `[SECURITY_FATAL MUST-5] Target database contains non-disposable existing tables...`, impidiendo el borrado inadvertido de bases de datos de desarrollo o locales no desechables.
   - Tras inicializar el esquema de pruebas, se crea la tabla de marcado `public.fornexa_synthetic_test_marker` para autorizar de forma segura y reproducible ejecuciones subsiguientes en el entorno de pruebas.

3. **Captura UI de Mediciones en `app/dashboard/almacenes/WmsWorkspace.tsx`**:
   - Se suprimen los fallbacks silenciosos `|| hu.gross_weight_kg` y `|| hu.volume_m3` que transformaban la omisión de medición por parte del operario en una supuesta confirmación idéntica al valor esperado de la HU.
   - Los campos de entrada interactiva inician con valor vacío (`""`).
   - Se incorpora un campo visible e interactivo para volumen medido (`measured_volume_m3`), complementando al de peso medido (`measured_weight_kg`).
   - Si el operario deja ambos campos vacíos, la UI no envía valores ficticios, garantizando que el servidor aplique la política de almacén correspondiente: el servidor acepta el dato vigente de SGA, también si esas políticas están activas; rechaza si no dispone de un valor válido y no inventa marcas de medición sobre datos heredados.

4. **Declaración de Alcance de Stubs Sintéticos y Gates**:
   - Se declara formalmente que el arnés relacional `verify-c3-postgres.mjs` aísla y certifica la lógica transaccional del RPC `fornexa_wms_action`, triggers relacionales, cálculo de tolerancias, atomicidad y serialización de concurrencia bajo PostgreSQL 16.
   - Las definiciones simplificadas de `auth.users`, roles `anon`/`authenticated`/`service_role` y `tenants` en el arnés actúan como stubs sintéticos para las pruebas unitarias y de integración del RPC en entorno aislado, sin suplantar el conjunto completo de políticas RLS y restricciones del esquema maestro del proyecto, cuya validación global se efectúa en los entornos integrados de preproducción.

---

## 8. Subsanación 7 (Seguimiento de SHOULDs tras dictamen MERGE YES `16832da` y Merge de PR #134)

Tras la 6ª revisión independiente de DeepSeek (`review-134-16832da/REVIEW-DEEPSEEK-16832da.md`), el dictamen MERGE YES con 2 MUST cerrados y la fusión de PR #134 en commit `8600ce03bc80f734866136dd2998c85155af592a`, se resuelven los dos SHOULD de seguimiento identificados por la coordinación:

1. **SHOULD-1 (Corrección Documental del Código de Rechazo en Tolerancia)**:
   - Se elimina la cita errónea a un código de medición inexistente en la Sección 7.3.
   - Se documenta el comportamiento real de la migración: cuando la política de almacén exige medición física y no se suministra, el servidor aplica fail-closed levantando la excepción `WMS_WEIGHT_TOLERANCE` (reutilizando el código cerrado de tolerancia para no introducir tipos ni códigos no catalogados en el cliente).

2. **SHOULD-2 (Prueba Unitaria de la Guardia de Base de Datos Desechable `validateDisposableDatabase`)**:
   - Se exportan `validateDisposableDatabase` y `validateIsolation` desde `scripts/wms/verify-c3-postgres.mjs`, condicionando la ejecución directa del arnés relacional a su invocación por CLI.
   - En `tests/wms-c3-server-controls.test.ts` se añade una suite de pruebas automatizadas con clientes simulados que comprueban:
     - Rechazo estricto con `[SECURITY_FATAL MUST-5]` ante bases de datos relacionales con tablas existentes en `public` que carezcan de la marca sintética `fornexa_synthetic_test_marker`.
     - Autorización segura ante bases de datos con el marcador sintético presente (reutilización del entorno de pruebas).
     - Autorización segura ante bases de datos vacías (0 tablas).
     - Autorización inmediata del sandbox en memoria PGlite WASM sin consultar metadatos.
     - Rechazo estricto en `validateIsolation` ante hosts ajenos al bucle local (`127.0.0.1`, `localhost`, `::1`) o nombres de base de datos de producción/sistema (`postgres`, `production`, `supabase`).
     - Comprobación estática de orden de invocación: `validateDisposableDatabase` se ejecuta estrictamente antes de cualquier instrucción destructiva `DROP SCHEMA public CASCADE`.




