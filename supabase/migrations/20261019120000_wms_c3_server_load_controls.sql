-- ============================================================================
-- MIGRATION: 20261019120000_wms_c3_server_load_controls.sql
-- DESCRIPTION: C-3 Server-side load controls and warehouse behavior policy enforcement
-- AUTHOR: Gemini (Fornexa)
-- DATE: 2026-10-19
--
-- ROLLBACK INSTRUCTIONS & REVERSIBILITY GUARANTEES (MUST-2 / PROTECTED ROLLBACK):
-- 1. Nivel 1 (Rollback Operativo Inmediato - Cero DDL / Sin Downtime):
--    Desactivar la exigencia de control físico y medición en políticas de almacén:
--    UPDATE public.warehouse_behavior_policies
--       SET params = jsonb_set(jsonb_set(params, '{require_state_control_on_load}', 'false'::jsonb), '{require_weight_measurement}', 'false'::jsonb),
--           updated_at = now();
-- 2. Nivel 2 (Rollback de RPC Protegido - Sin Reabrir Bypass E1):
--    Aplicar supabase/migrations/rollback/20261019120000_wms_c3_rollback_protected.sql.
--    CONDICIÓN VINCULANTE (SHOULD-I): Solo válido si no hay migraciones posteriores a
--    20261019120000_wms_c3_server_load_controls.sql que modifiquen fornexa_wms_action.
--    Dicha definición preserva el cómputo seguro de peso/volumen esperado en servidor y la
--    consolidación exclusiva por política, sin aceptar parámetros manipulados del payload.
--    Las columnas state_controlled_at/by y measured_at/by se conservan nulables para preservar
--    el histórico y evitar contención o pérdida de datos.
-- 3. Note on inventory state integrity:
--    handling_units.state values 'QUARANTINE' and 'DAMAGED' and inventory_quants.stock_status
--    values 'QUARANTINE' and 'DAMAGED' are already defined in the core E1 domain
--    (20261017110000_wms_e1_core.sql and 20261002233000_master_data_foundation.sql).
--    Any handling units transitioned to QUARANTINE/DAMAGED remain fully valid and consistent in E1.
-- 4. NOTA OPERATIVA DE DESPLIEGUE (ROLLOUT SAFETY - MUST-A):
--    handling_units.state_controlled_at es una columna nueva inicializada en NULL para el inventario existente.
--    Cualquier HU en estado 'PICKED_STAGED' existente previa a esta migración tendrá state_controlled_at = NULL.
--    Con la política require_state_control_on_load = true, el primer intento de LOAD fallará cerrado con
--    WMS_CONTROL_PENDING.
--    PLAN OPERATIVO DE ROLLOUT:
--    a) Los operarios deben ejecutar CONTROL_STATE PASSED sobre las HUs preparadas antes de LOAD, o
--    b) Para almacenes con stock legado en tránsito, fijar explícitamente require_state_control_on_load = false
--       en la política de almacén correspondiente antes de la carga.
-- 5. NOTA DE ORDEN DE EJECUCIÓN Y ATOMICIDAD (MUST-1):
--    El backfill de require_state_control_on_load se ubica al final de la migración (sección 4),
--    tras definir fornexa_wms_action con soporte de CONTROL_STATE, y debe ejecutarse en un único
--    bloque transaccional atómico (BEGIN ... COMMIT).
-- ============================================================================

-- ── 1. Schema Alterations: Add State Control & Measurement Columns to Handling Units ────────
alter table public.handling_units
  add column if not exists state_controlled_at timestamptz,
  add column if not exists state_controlled_by uuid references auth.users(id) on delete set null,
  add column if not exists measured_at timestamptz,
  add column if not exists measured_by uuid references auth.users(id) on delete set null;

create index if not exists idx_handling_units_state_control
  on public.handling_units(tenant_id, warehouse_id, state_controlled_at)
  where state_controlled_at is not null;

alter table public.warehouse_tasks
  drop constraint if exists warehouse_tasks_task_type_check;

alter table public.warehouse_tasks
  add constraint warehouse_tasks_task_type_check check (task_type in (
    'RECEIVE_CHECK','PUTAWAY','REPLENISH','PICK','PACK','LABEL','LOAD','COUNT','TRANSFER','CONTROL_STATE'
  ));

alter table public.warehouse_tasks
  drop constraint if exists warehouse_tasks_state_check;

alter table public.warehouse_tasks
  add constraint warehouse_tasks_state_check check (state in (
    'PROPOSED','READY','ASSIGNED','IN_PROGRESS','DONE','REJECTED','CANCELLED','FAILED'
  ));

-- ── 2. Automatic Control & Measurement Invalidation Trigger on Mutation ────────────
create or replace function public.fornexa_wms_invalidate_hu_control()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'inventory_quants' then
    if tg_op = 'UPDATE' then
      if old.hu_id is distinct from new.hu_id then
        if old.hu_id is not null then
          update public.handling_units
             set state_controlled_at = null,
                 state_controlled_by = null,
                 measured_at = null,
                 measured_by = null,
                 updated_at = clock_timestamp()
           where tenant_id = old.tenant_id and id = old.hu_id
             and (state_controlled_at is not null or state_controlled_by is not null or measured_at is not null or measured_by is not null);
        end if;
        if new.hu_id is not null then
          update public.handling_units
             set state_controlled_at = null,
                 state_controlled_by = null,
                 measured_at = null,
                 measured_by = null,
                 updated_at = clock_timestamp()
           where tenant_id = new.tenant_id and id = new.hu_id
             and (state_controlled_at is not null or state_controlled_by is not null or measured_at is not null or measured_by is not null);
        end if;
      end if;
    elsif tg_op = 'DELETE' and old.hu_id is not null then
      update public.handling_units
         set state_controlled_at = null,
             state_controlled_by = null,
             measured_at = null,
             measured_by = null,
             updated_at = clock_timestamp()
       where tenant_id = old.tenant_id and id = old.hu_id
         and (state_controlled_at is not null or state_controlled_by is not null or measured_at is not null or measured_by is not null);
    elsif tg_op = 'INSERT' and new.hu_id is not null then
      update public.handling_units
         set state_controlled_at = null,
             state_controlled_by = null,
             measured_at = null,
             measured_by = null,
             updated_at = clock_timestamp()
       where tenant_id = new.tenant_id and id = new.hu_id
         and (state_controlled_at is not null or state_controlled_by is not null or measured_at is not null or measured_by is not null);
    end if;
    return coalesce(new, old);
  else
    if tg_op = 'DELETE' then
      update public.handling_units
         set state_controlled_at = null,
             state_controlled_by = null,
             measured_at = null,
             measured_by = null,
             updated_at = clock_timestamp()
       where tenant_id = old.tenant_id
         and id = old.handling_unit_id
         and (state_controlled_at is not null or state_controlled_by is not null or measured_at is not null or measured_by is not null);
      return old;
    else
      update public.handling_units
         set state_controlled_at = null,
             state_controlled_by = null,
             measured_at = null,
             measured_by = null,
             updated_at = clock_timestamp()
       where tenant_id = new.tenant_id
         and id = new.handling_unit_id
         and (state_controlled_at is not null or state_controlled_by is not null or measured_at is not null or measured_by is not null);
      return new;
    end if;
  end if;
end;
$$;

drop trigger if exists trg_wms_invalidate_hu_control on public.handling_unit_contents;
create trigger trg_wms_invalidate_hu_control
  after insert or update or delete
  on public.handling_unit_contents
  for each row
  execute function public.fornexa_wms_invalidate_hu_control();

drop trigger if exists trg_wms_invalidate_hu_control_quants on public.inventory_quants;
create trigger trg_wms_invalidate_hu_control_quants
  after insert or update or delete
  on public.inventory_quants
  for each row
  execute function public.fornexa_wms_invalidate_hu_control();

-- ── 2b. Robust Policy Boolean Parser (MUST-A / Fail-Closed) ───────────────────
create or replace function public.fornexa_wms_policy_bool(
  p_policy jsonb,
  p_key text,
  p_default boolean default true
) returns boolean
language plpgsql
immutable
as $$
declare
  v_raw text;
begin
  if p_policy is null or not (p_policy ? p_key) then
    return p_default;
  end if;
  v_raw := lower(trim(coalesce(p_policy->>p_key, '')));
  if v_raw = '' then
    return p_default;
  elsif v_raw in ('true', '1', 't', 'yes', 'si', 'on') then
    return true;
  elsif v_raw in ('false', '0', 'f', 'no', 'off') then
    return false;
  else
    -- Fail-closed default on invalid / non-parseable syntax (avoids PostgreSQL 22P02)
    return p_default;
  end if;
end;
$$;

-- ── 3. Updated Atomic Mutation RPC: fornexa_wms_action ───────────────────────
create or replace function public.fornexa_wms_action(
  p_tenant uuid,
  p_actor uuid,
  p_action text,
  p_payload jsonb,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_idem text := nullif(trim(coalesce(p_idempotency_key, case when p_payload is not null then p_payload->>'idempotency_key' else null end, '')), '');
  v_fingerprint text;
  v_existing_task public.warehouse_tasks;
  v_hu public.handling_units;
  v_bin public.warehouse_bins;
  v_zone public.warehouse_zones;
  v_quant public.inventory_quants;
  v_product public.products;
  v_resource public.warehouse_resources;
  v_res public.stock_reservations;
  v_task public.warehouse_tasks;
  v_policy jsonb;
  v_warehouse_id uuid;
  v_product_id uuid;
  v_hu_id uuid;
  v_bin_id uuid;
  v_quant_id uuid;
  v_res_id uuid;
  v_resource_id uuid;
  v_task_id uuid;
  v_batch text;
  v_serial text;
  v_expiry date;
  v_qty numeric(12,3);
  v_uom text;
  v_active_reserved numeric(12,3);
  v_free numeric(12,3);
  v_current_pallets integer;
  v_current_weight numeric(12,3);
  v_current_volume numeric(12,4);
  v_measured_weight numeric(10,3);
  v_measured_volume numeric(10,4);
  v_expected_weight numeric(10,3);
  v_expected_volume numeric(10,4);
  v_computed_weight numeric(10,3);
  v_computed_volume numeric(10,4);
  v_weight_tol numeric(6,2);
  v_vol_tol numeric(6,2);
  v_scanned_code text;
  v_scanned_batch text;
  v_consolidation text;
  v_disposition text;
  v_rej_state text;
  v_control_status text;
  v_req_weight boolean;
  v_req_vol boolean;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_ts timestamptz := date_trunc('milliseconds', clock_timestamp());
begin
  -- 0) Fail-closed safe default for null payload
  if p_payload is null then
    p_payload := '{}'::jsonb;
  end if;

  -- 1) Explicit tenant mismatch check if payload declares tenant_id
  if (p_payload ? 'tenant_id') and nullif(p_payload->>'tenant_id', '') is not null then
    if (p_payload->>'tenant_id')::uuid is distinct from p_tenant then
      raise exception 'WMS_TENANT_MISMATCH';
    end if;
  end if;

  -- 2) Actor membership and operational role check
  select tm.role into v_role
    from public.tenant_members tm
   where tm.tenant_id = p_tenant
     and tm.user_id = p_actor
     and tm.status = 'ACTIVE'
     and tm.role in ('OWNER','ADMIN','PLANNER','OPERATOR');

  if v_role is null then
    raise exception 'WMS_FORBIDDEN';
  end if;

  -- 3) Idempotency check across warehouse_tasks
  v_fingerprint := coalesce(p_action, '') || ':' ||
                   coalesce(p_payload->>'hu_id', '') || ':' ||
                   coalesce(p_payload->>'quant_id', '') || ':' ||
                   coalesce(p_payload->>'reservation_id', '') || ':' ||
                   coalesce(p_payload->>'destination_bin_id', '') || ':' ||
                   coalesce(p_payload->>'quantity', '') || ':' ||
                   coalesce(upper(trim(p_payload->>'status')), '') || ':' ||
                   coalesce(p_payload->>'reject_code', '') || ':' ||
                   coalesce(p_payload->>'reason', '') || ':' ||
                   coalesce(upper(trim(p_payload->>'disposition')), '');

  if v_idem is not null then
    select * into v_existing_task
      from public.warehouse_tasks wt
     where wt.tenant_id = p_tenant
       and wt.idempotency_key = v_idem
       for update;

    if found then
      if v_existing_task.state in ('DONE', 'FAILED') and coalesce(v_existing_task.reject_detail, v_fingerprint) = v_fingerprint then
        return jsonb_build_object(
          'ok', true,
          'idempotent_replay', true,
          'action', p_action,
          'task_id', v_existing_task.id,
          'hu_id', v_existing_task.hu_id,
          'destination_bin_id', v_existing_task.destination_bin_id,
          'status', case when v_existing_task.state = 'FAILED' then 'REJECTED' else 'PASSED' end
        );
      else
        raise exception 'WMS_DUPLICATE';
      end if;
    end if;
  end if;

  -- ── ACTION: RECEIVE_CHECK ──────────────────────────────────────────────────
  if p_action = 'RECEIVE_CHECK' then
    v_hu_id := (p_payload->>'hu_id')::uuid;
    select * into v_hu
      from public.handling_units hu
     where hu.tenant_id = p_tenant and hu.id = v_hu_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    if (p_payload ? 'warehouse_id') and nullif(p_payload->>'warehouse_id', '') is not null
       and (p_payload->>'warehouse_id')::uuid <> v_hu.warehouse_id then
      raise exception 'WMS_CROSS_WAREHOUSE_INVALID';
    end if;

    if v_hu.state <> 'STAGING_UNCHECKED' then
      raise exception 'WMS_HU_NOT_UNCHECKED';
    end if;

    v_product_id := coalesce(
      nullif(p_payload->>'product_id', '')::uuid,
      (select huc.product_id from public.handling_unit_contents huc where huc.tenant_id = p_tenant and huc.handling_unit_id = v_hu.id limit 1)
    );
    select * into v_product from public.products pr where pr.tenant_id = p_tenant and pr.id = v_product_id;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    v_policy := public.fornexa_wms_effective_policy(p_tenant, v_hu.warehouse_id, v_hu.owner_party_id, v_product_id);

    v_batch := nullif(trim(coalesce(
      p_payload->>'batch_number',
      (select huc.batch_number from public.handling_unit_contents huc where huc.tenant_id = p_tenant and huc.handling_unit_id = v_hu.id limit 1),
      ''
    )), '');

    v_expiry := coalesce(
      nullif(p_payload->>'expiry_date', '')::date,
      (select huc.expiry_date from public.handling_unit_contents huc where huc.tenant_id = p_tenant and huc.handling_unit_id = v_hu.id limit 1)
    );

    if (public.fornexa_wms_policy_bool(v_policy, 'capture_lot_on_receipt', true) or v_product.is_batch_managed) and v_batch is null then
      raise exception 'WMS_LOT_REQUIRED';
    end if;

    if (public.fornexa_wms_policy_bool(v_policy, 'capture_expiry_on_receipt', true) or v_product.shelf_life_days is not null) and v_expiry is null then
      raise exception 'WMS_EXPIRY_REQUIRED';
    end if;

    v_qty := coalesce(
      nullif(p_payload->>'quantity', '')::numeric(12,3),
      (select huc.quantity from public.handling_unit_contents huc where huc.tenant_id = p_tenant and huc.handling_unit_id = v_hu.id limit 1),
      1
    );
    v_uom := coalesce(nullif(p_payload->>'uom', ''), v_product.uom_base, 'UN');

    v_before := to_jsonb(v_hu);

    update public.handling_units
       set state = 'STAGING_CHECKED',
           gross_weight_kg = coalesce(nullif(p_payload->>'gross_weight_kg', '')::numeric(10,3), gross_weight_kg),
           volume_m3 = coalesce(nullif(p_payload->>'volume_m3', '')::numeric(10,4), volume_m3),
           state_controlled_at = null,
           state_controlled_by = null,
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_hu.id
     returning * into v_hu;

    if exists (select 1 from public.handling_unit_contents where tenant_id = p_tenant and handling_unit_id = v_hu.id) then
      update public.handling_unit_contents
         set batch_number = v_batch,
             expiry_date = v_expiry,
             quantity = v_qty,
             uom = v_uom
       where tenant_id = p_tenant and handling_unit_id = v_hu.id and product_id = v_product_id;
    else
      insert into public.handling_unit_contents (tenant_id, handling_unit_id, product_id, batch_number, expiry_date, quantity, uom)
      values (p_tenant, v_hu.id, v_product_id, v_batch, v_expiry, v_qty, v_uom);
    end if;

    if exists (select 1 from public.inventory_quants where tenant_id = p_tenant and hu_id = v_hu.id) then
      update public.inventory_quants
         set flow_state = 'STAGING_CHECKED',
             batch_number = coalesce(v_batch, batch_number),
             expiry_date = coalesce(v_expiry, expiry_date),
             quantity_on_hand = v_qty,
             updated_at = v_ts
       where tenant_id = p_tenant and hu_id = v_hu.id;
    elsif v_hu.current_bin_id is not null then
      insert into public.inventory_quants (
        tenant_id, warehouse_id, bin_id, product_id, owner_party_id, batch_number, expiry_date,
        quantity_on_hand, quantity_reserved, uom, stock_status, flow_state, hu_id
      ) values (
        p_tenant, v_hu.warehouse_id, v_hu.current_bin_id, v_product_id, v_hu.owner_party_id, v_batch, v_expiry,
        v_qty, 0, v_uom, 'AVAILABLE', 'STAGING_CHECKED', v_hu.id
      );
    end if;

    insert into public.inventory_movements (
      tenant_id, warehouse_id, movement_type, product_id, destination_bin_id,
      quantity, uom, owner_party_id, batch_number, operator_id, started_at, completed_at, status, notes
    ) values (
      p_tenant, v_hu.warehouse_id, 'RECEIPT', v_product_id, v_hu.current_bin_id,
      v_qty, v_uom, v_hu.owner_party_id, v_batch, p_actor::text, v_ts, v_ts, 'COMPLETED', 'RECEIVE_CHECK ' || v_hu.code
    );

    insert into public.warehouse_tasks (
      tenant_id, warehouse_id, task_type, state, hu_id, product_id, destination_bin_id,
      quantity, uom, idempotency_key, reject_detail, started_at, completed_at
    ) values (
      p_tenant, v_hu.warehouse_id, 'RECEIVE_CHECK', 'DONE', v_hu.id, v_product_id, v_hu.current_bin_id,
      v_qty, v_uom, v_idem, v_fingerprint, v_ts, v_ts
    ) returning * into v_task;

    insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
    values (p_tenant, 'HANDLING_UNIT', v_hu.id, 'RECEIVE_CHECK', p_actor, 'FORNEXA_WMS', v_before, to_jsonb(v_hu));

    return jsonb_build_object('ok', true, 'action', 'RECEIVE_CHECK', 'hu', to_jsonb(v_hu), 'task_id', v_task.id);

  -- ── ACTION: PUTAWAY ────────────────────────────────────────────────────────
  elsif p_action = 'PUTAWAY' then
    v_hu_id := (p_payload->>'hu_id')::uuid;
    v_bin_id := (p_payload->>'destination_bin_id')::uuid;

    select * into v_hu
      from public.handling_units hu
     where hu.tenant_id = p_tenant and hu.id = v_hu_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    select * into v_bin
      from public.warehouse_bins wb
     where wb.tenant_id = p_tenant and wb.id = v_bin_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    if v_hu.warehouse_id <> v_bin.warehouse_id then
      raise exception 'WMS_CROSS_WAREHOUSE_INVALID';
    end if;

    if v_hu.state <> 'STAGING_CHECKED' then
      raise exception 'WMS_HU_NOT_CHECKED';
    end if;

    if not v_bin.is_active or v_bin.is_blocked then
      raise exception 'WMS_BIN_BLOCKED';
    end if;

    select huc.product_id, huc.batch_number, huc.serial_number, huc.expiry_date, huc.quantity, huc.uom
      into v_product_id, v_batch, v_serial, v_expiry, v_qty, v_uom
      from public.handling_unit_contents huc
     where huc.tenant_id = p_tenant and huc.handling_unit_id = v_hu.id
     limit 1;

    if v_product_id is null then
      v_product_id := (p_payload->>'product_id')::uuid;
      v_batch := nullif(trim(coalesce(p_payload->>'batch_number', '')), '');
      v_expiry := nullif(p_payload->>'expiry_date', '')::date;
      v_qty := coalesce(nullif(p_payload->>'quantity', '')::numeric(12,3), 1);
      v_uom := coalesce(nullif(p_payload->>'uom', ''), 'UN');
    end if;

    select * into v_product from public.products pr where pr.tenant_id = p_tenant and pr.id = v_product_id;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    v_policy := public.fornexa_wms_effective_policy(p_tenant, v_hu.warehouse_id, v_hu.owner_party_id, v_product_id);

    -- Check resource compatibility if resource_id provided
    if (p_payload ? 'resource_id') and nullif(p_payload->>'resource_id', '') is not null then
      v_resource_id := (p_payload->>'resource_id')::uuid;
      select * into v_resource
        from public.warehouse_resources wr
       where wr.tenant_id = p_tenant and wr.id = v_resource_id
         for update;
      if not found then
        raise exception 'WMS_FORBIDDEN';
      end if;
      if v_resource.warehouse_id <> v_hu.warehouse_id then
        raise exception 'WMS_CROSS_WAREHOUSE_INVALID';
      end if;
      if not v_resource.is_active or v_resource.status in ('OFFLINE','MAINTENANCE') then
        raise exception 'WMS_RESOURCE_INCOMPATIBLE';
      end if;
      if v_resource.max_weight_kg is not null and coalesce(v_hu.gross_weight_kg, 0) > v_resource.max_weight_kg then
        raise exception 'WMS_RESOURCE_INCOMPATIBLE';
      end if;
      if public.fornexa_wms_policy_bool(v_policy, 'require_resource_certification', true) and v_product.is_hazardous
         and not ('ADR' = any(v_resource.certifications)) then
        raise exception 'WMS_RESOURCE_INCOMPATIBLE';
      end if;
    end if;

    -- Zone temperature & ADR compatibility
    if v_bin.zone_id is not null then
      select * into v_zone from public.warehouse_zones wz where wz.tenant_id = p_tenant and wz.id = v_bin.zone_id;
      if found then
        if v_product.is_temperature_controlled then
          if v_product.temp_max_c is not null and v_product.temp_max_c <= 0 and v_zone.temperature_regime <> 'FROZEN' then
            raise exception 'WMS_TEMP_MISMATCH';
          elsif v_product.temp_max_c is not null and v_product.temp_max_c <= 8 and v_product.temp_max_c > 0
                and v_zone.temperature_regime not in ('CHILLED','CONTROLLED') then
            raise exception 'WMS_TEMP_MISMATCH';
          elsif v_zone.temperature_regime = 'AMBIENT' then
            raise exception 'WMS_TEMP_MISMATCH';
          end if;
        end if;
        if v_product.is_hazardous and v_zone.zone_code like '%NO-ADR%' then
          raise exception 'WMS_ADR_INCOMPATIBLE';
        end if;
      end if;
    end if;

    if v_product.is_hazardous and coalesce(p_payload->>'adr_incompatible', 'false') = 'true' then
      raise exception 'WMS_ADR_INCOMPATIBLE';
    end if;

    -- Bin capacity check (pallets, weight, volume)
    select count(*)::int, coalesce(sum(hu.gross_weight_kg), 0), coalesce(sum(hu.volume_m3), 0)
      into v_current_pallets, v_current_weight, v_current_volume
      from public.handling_units hu
     where hu.tenant_id = p_tenant
       and hu.current_bin_id = v_bin.id
       and hu.state = 'STORED'
       and hu.is_active = true
       and hu.id <> v_hu.id;

    if v_bin.max_pallets > 0 and (v_current_pallets + 1) > v_bin.max_pallets then
      raise exception 'WMS_BIN_CAPACITY';
    end if;
    if v_bin.max_weight_kg is not null and (v_current_weight + coalesce(v_hu.gross_weight_kg, 0)) > v_bin.max_weight_kg then
      raise exception 'WMS_BIN_CAPACITY';
    end if;
    if v_bin.max_volume_m3 is not null and (v_current_volume + coalesce(v_hu.volume_m3, 0)) > v_bin.max_volume_m3 then
      raise exception 'WMS_BIN_CAPACITY';
    end if;

    -- Lot mixing policy check
    if not public.fornexa_wms_policy_bool(v_policy, 'allow_mixed_lots_in_bin', false) then
      if exists (
        select 1 from public.inventory_quants iq
         where iq.tenant_id = p_tenant
           and iq.bin_id = v_bin.id
           and iq.quantity_on_hand > 0
           and iq.batch_number is distinct from v_batch
           and (iq.hu_id is null or iq.hu_id <> v_hu.id)
      ) then
        raise exception 'WMS_LOT_MIX_FORBIDDEN';
      end if;
    end if;

    v_before := to_jsonb(v_hu);

    update public.handling_units
       set state = 'STORED',
           current_bin_id = v_bin.id,
           current_dock_id = null,
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_hu.id
     returning * into v_hu;

    if exists (select 1 from public.inventory_quants where tenant_id = p_tenant and hu_id = v_hu.id) then
      update public.inventory_quants
         set bin_id = v_bin.id,
             flow_state = 'STORED',
             stock_status = 'AVAILABLE',
             batch_number = coalesce(v_batch, batch_number),
             expiry_date = coalesce(v_expiry, expiry_date),
             quantity_on_hand = v_qty,
             updated_at = v_ts
       where tenant_id = p_tenant and hu_id = v_hu.id
       returning * into v_quant;
    else
      insert into public.inventory_quants (
        tenant_id, warehouse_id, bin_id, product_id, owner_party_id, batch_number, serial_number, expiry_date,
        quantity_on_hand, quantity_reserved, uom, stock_status, flow_state, hu_id
      ) values (
        p_tenant, v_hu.warehouse_id, v_bin.id, v_product_id, v_hu.owner_party_id, v_batch, v_serial, v_expiry,
        v_qty, 0, v_uom, 'AVAILABLE', 'STORED', v_hu.id
      ) returning * into v_quant;
    end if;

    insert into public.inventory_movements (
      tenant_id, warehouse_id, movement_type, product_id, source_bin_id, destination_bin_id,
      quantity, uom, owner_party_id, batch_number, serial_number, operator_id, resource_id,
      started_at, completed_at, status, notes
    ) values (
      p_tenant, v_hu.warehouse_id, 'PUTAWAY', v_product_id, (v_before->>'current_bin_id')::uuid, v_bin.id,
      v_qty, v_uom, v_hu.owner_party_id, v_batch, v_serial, p_actor::text, v_resource_id,
      v_ts, v_ts, 'COMPLETED', 'PUTAWAY ' || v_hu.code || ' -> ' || v_bin.bin_code
    );

    insert into public.warehouse_tasks (
      tenant_id, warehouse_id, task_type, state, assigned_resource_id, source_bin_id, destination_bin_id,
      hu_id, product_id, quantity, uom, idempotency_key, reject_detail, started_at, completed_at
    ) values (
      p_tenant, v_hu.warehouse_id, 'PUTAWAY', 'DONE', v_resource_id, (v_before->>'current_bin_id')::uuid, v_bin.id,
      v_hu.id, v_product_id, v_qty, v_uom, v_idem, v_fingerprint, v_ts, v_ts
    ) returning * into v_task;

    insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
    values (p_tenant, 'HANDLING_UNIT', v_hu.id, 'PUTAWAY', p_actor, 'FORNEXA_WMS', v_before, to_jsonb(v_hu));

    return jsonb_build_object('ok', true, 'action', 'PUTAWAY', 'hu', to_jsonb(v_hu), 'quant', to_jsonb(v_quant), 'task_id', v_task.id);

  -- ── ACTION: RESERVE ────────────────────────────────────────────────────────
  elsif p_action = 'RESERVE' then
    v_quant_id := (p_payload->>'quant_id')::uuid;
    v_qty := (p_payload->>'quantity')::numeric(12,3);

    select * into v_quant
      from public.inventory_quants iq
     where iq.tenant_id = p_tenant and iq.id = v_quant_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    if (p_payload ? 'warehouse_id') and nullif(p_payload->>'warehouse_id', '') is not null
       and (p_payload->>'warehouse_id')::uuid <> v_quant.warehouse_id then
      raise exception 'WMS_CROSS_WAREHOUSE_INVALID';
    end if;

    if v_quant.flow_state is null or v_quant.flow_state not in ('STORED', 'RESERVED') then
      raise exception 'WMS_STOCK_NOT_LOCATED';
    end if;

    if v_quant.stock_status not in ('AVAILABLE', 'RESERVED') then
      raise exception 'WMS_STOCK_BLOCKED';
    end if;

    if exists (
      select 1 from public.warehouse_tasks wt
       where wt.tenant_id = p_tenant
         and wt.destination_bin_id = v_quant.bin_id
         and wt.product_id = v_quant.product_id
         and wt.task_type = 'REPLENISH'
         and wt.state in ('PROPOSED','READY','ASSIGNED','IN_PROGRESS')
    ) then
      raise exception 'WMS_REPLENISHMENT_PENDING';
    end if;

    select coalesce(sum(sr.quantity), 0) into v_active_reserved
      from public.stock_reservations sr
     where sr.tenant_id = p_tenant
       and sr.quant_id = v_quant.id
       and sr.status in ('HELD','ALLOCATED');

    v_free := v_quant.quantity_on_hand - greatest(v_quant.quantity_reserved, v_active_reserved);
    if v_qty is null or v_qty <= 0 or v_free < v_qty then
      select wb.* into v_bin from public.warehouse_bins wb where wb.tenant_id = p_tenant and wb.id = v_quant.bin_id;
      select wz.* into v_zone from public.warehouse_zones wz where wz.tenant_id = p_tenant and wz.id = v_bin.zone_id;
      if v_zone.zone_type = 'PICKING' then
        raise exception 'WMS_INSUFFICIENT_PICK_STOCK';
      else
        raise exception 'WMS_INSUFFICIENT_STOCK';
      end if;
    end if;

    if (p_payload ? 'batch_number') and nullif(p_payload->>'batch_number', '') is not null
       and (p_payload->>'batch_number') is distinct from v_quant.batch_number then
      raise exception 'WMS_LOT_MISMATCH';
    end if;

    v_before := to_jsonb(v_quant);

    insert into public.stock_reservations (
      tenant_id, quant_id, hu_id, order_id, order_line_id, trip_id,
      batch_number, serial_number, quantity, uom, status, created_by
    ) values (
      p_tenant,
      v_quant.id,
      coalesce(nullif(p_payload->>'hu_id', '')::uuid, v_quant.hu_id),
      nullif(p_payload->>'order_id', '')::uuid,
      nullif(p_payload->>'order_line_id', '')::uuid,
      nullif(p_payload->>'trip_id', '')::uuid,
      v_quant.batch_number,
      v_quant.serial_number,
      v_qty,
      v_quant.uom,
      'ALLOCATED',
      p_actor
    ) returning * into v_res;

    update public.inventory_quants
       set quantity_reserved = quantity_reserved + v_qty,
           flow_state = 'RESERVED',
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_quant.id
     returning * into v_quant;

    insert into public.warehouse_tasks (
      tenant_id, warehouse_id, task_type, state, source_bin_id, hu_id, product_id,
      quantity, uom, idempotency_key, reject_detail
    ) values (
      p_tenant, v_quant.warehouse_id, 'PICK', 'READY', v_quant.bin_id, v_res.hu_id, v_quant.product_id,
      v_qty, v_quant.uom, v_idem, v_fingerprint
    ) returning * into v_task;

    insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
    values (p_tenant, 'STOCK_RESERVATION', v_res.id, 'RESERVE', p_actor, 'FORNEXA_WMS', v_before, to_jsonb(v_res));

    return jsonb_build_object('ok', true, 'action', 'RESERVE', 'reservation', to_jsonb(v_res), 'quant', to_jsonb(v_quant), 'task_id', v_task.id);

  -- ── ACTION: PICK ───────────────────────────────────────────────────────────
  elsif p_action = 'PICK' then
    v_res_id := nullif(p_payload->>'reservation_id', '')::uuid;
    if v_res_id is null then
      raise exception 'WMS_NOT_RESERVED';
    end if;

    select * into v_res
      from public.stock_reservations sr
     where sr.tenant_id = p_tenant and sr.id = v_res_id
       for update;
    if not found or v_res.status <> 'ALLOCATED' then
      raise exception 'WMS_NOT_RESERVED';
    end if;

    select * into v_quant
      from public.inventory_quants iq
     where iq.tenant_id = p_tenant and iq.id = v_res.quant_id
       for update;
    if not found then
      raise exception 'WMS_NOT_RESERVED';
    end if;

    if v_quant.flow_state is null or v_quant.flow_state not in ('STORED','RESERVED') then
      raise exception 'WMS_STOCK_NOT_LOCATED';
    end if;
    if v_quant.stock_status not in ('AVAILABLE','RESERVED') then
      raise exception 'WMS_STOCK_BLOCKED';
    end if;

    v_policy := public.fornexa_wms_effective_policy(p_tenant, v_quant.warehouse_id, v_quant.owner_party_id, v_quant.product_id);

    v_scanned_batch := nullif(trim(coalesce(p_payload->>'scanned_batch', p_payload->>'batch_number', '')), '');
    if public.fornexa_wms_policy_bool(v_policy, 'capture_lot_on_pick', true) and v_res.batch_number is not null then
      if v_scanned_batch is distinct from v_res.batch_number then
        raise exception 'WMS_LOT_MISMATCH';
      end if;
    end if;

    if (p_payload ? 'resource_id') and nullif(p_payload->>'resource_id', '') is not null then
      v_resource_id := (p_payload->>'resource_id')::uuid;
      select * into v_resource
        from public.warehouse_resources wr
       where wr.tenant_id = p_tenant and wr.id = v_resource_id
         for update;
      if not found then
        raise exception 'WMS_FORBIDDEN';
      end if;
      if v_resource.warehouse_id <> v_quant.warehouse_id then
        raise exception 'WMS_CROSS_WAREHOUSE_INVALID';
      end if;
      if not v_resource.is_active or v_resource.status in ('OFFLINE','MAINTENANCE') then
        raise exception 'WMS_RESOURCE_INCOMPATIBLE';
      end if;
      if (p_payload ? 'required_height_m') and v_resource.max_lift_height_m is not null
         and (p_payload->>'required_height_m')::numeric > v_resource.max_lift_height_m then
        raise exception 'WMS_RESOURCE_INCOMPATIBLE';
      end if;
    end if;

    v_qty := coalesce(nullif(p_payload->>'quantity', '')::numeric(12,3), v_res.quantity);
    if v_qty <= 0 or v_qty > v_res.quantity then
      raise exception 'WMS_NOT_RESERVED';
    end if;

    v_before := to_jsonb(v_quant);

    update public.stock_reservations
       set status = 'PICKED'
     where tenant_id = p_tenant and id = v_res.id
     returning * into v_res;

    update public.inventory_quants
       set quantity_on_hand = quantity_on_hand - v_qty,
           quantity_reserved = greatest(0, quantity_reserved - v_qty),
           flow_state = case
             when (quantity_on_hand - v_qty) = 0 then 'PICKED_STAGED'
             when (quantity_reserved - v_qty) > 0 then 'RESERVED'
             else 'STORED'
           end,
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_quant.id
     returning * into v_quant;

    if v_res.hu_id is not null and v_quant.quantity_on_hand = 0 then
      update public.handling_units
         set state = 'PICKED_STAGED',
             state_controlled_at = null,
             state_controlled_by = null,
             updated_at = v_ts
       where tenant_id = p_tenant and id = v_res.hu_id;
    end if;

    insert into public.inventory_movements (
      tenant_id, warehouse_id, movement_type, product_id, source_bin_id, destination_bin_id,
      quantity, uom, owner_party_id, batch_number, serial_number, reference_order_id,
      operator_id, resource_id, started_at, completed_at, status, notes
    ) values (
      p_tenant, v_quant.warehouse_id, 'PICKING', v_quant.product_id, v_quant.bin_id, nullif(p_payload->>'destination_bin_id', '')::uuid,
      v_qty, v_quant.uom, v_quant.owner_party_id, v_res.batch_number, v_res.serial_number, v_res.order_id,
      p_actor::text, v_resource_id, v_ts, v_ts, 'COMPLETED', 'PICK reservation ' || v_res.id::text
    );

    insert into public.warehouse_tasks (
      tenant_id, warehouse_id, task_type, state, assigned_resource_id, source_bin_id, destination_bin_id,
      hu_id, product_id, quantity, uom, idempotency_key, reject_detail, started_at, completed_at
    ) values (
      p_tenant, v_quant.warehouse_id, 'PICK', 'DONE', v_resource_id, v_quant.bin_id, nullif(p_payload->>'destination_bin_id', '')::uuid,
      v_res.hu_id, v_quant.product_id, v_qty, v_quant.uom, v_idem, v_fingerprint, v_ts, v_ts
    ) returning * into v_task;

    insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
    values (p_tenant, 'STOCK_RESERVATION', v_res.id, 'PICK', p_actor, 'FORNEXA_WMS', v_before, to_jsonb(v_quant));

    return jsonb_build_object('ok', true, 'action', 'PICK', 'reservation', to_jsonb(v_res), 'quant', to_jsonb(v_quant), 'task_id', v_task.id);

  -- ── ACTION: REPLENISH / CONFIRM_TASK ───────────────────────────────────────
  elsif p_action in ('REPLENISH', 'CONFIRM_TASK') then
    if (p_payload ? 'task_id') and nullif(p_payload->>'task_id', '') is not null then
      v_task_id := (p_payload->>'task_id')::uuid;
      select * into v_task
        from public.warehouse_tasks wt
       where wt.tenant_id = p_tenant and wt.id = v_task_id
         for update;
      if not found then
        raise exception 'WMS_FORBIDDEN';
      end if;
      if v_task.state not in ('READY','ASSIGNED','IN_PROGRESS') then
        raise exception 'WMS_TASK_NOT_READY';
      end if;
      v_before := to_jsonb(v_task);
      update public.warehouse_tasks
         set state = 'DONE',
             completed_at = v_ts
       where tenant_id = p_tenant and id = v_task.id
       returning * into v_task;
      insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
      values (p_tenant, 'WAREHOUSE_TASK', v_task.id, p_action, p_actor, 'FORNEXA_WMS', v_before, to_jsonb(v_task));
      return jsonb_build_object('ok', true, 'action', p_action, 'task', to_jsonb(v_task));
    end if;

    v_warehouse_id := (p_payload->>'warehouse_id')::uuid;
    v_product_id := (p_payload->>'product_id')::uuid;
    v_bin_id := (p_payload->>'destination_bin_id')::uuid;
    v_qty := coalesce(nullif(p_payload->>'quantity', '')::numeric(12,3), 1);
    v_policy := public.fornexa_wms_effective_policy(p_tenant, v_warehouse_id, null, v_product_id);

    -- C-3 Policy derivation: consolidation behavior is derived strictly from server policy
    v_consolidation := coalesce(v_policy->>'consolidation', 'YES');

    select * into v_quant
      from public.inventory_quants iq
     where iq.tenant_id = p_tenant
       and iq.warehouse_id = v_warehouse_id
       and iq.product_id = v_product_id
       and iq.flow_state = 'STORED'
       and iq.stock_status = 'AVAILABLE'
       and (iq.quantity_on_hand - iq.quantity_reserved) >= v_qty
     order by iq.expiry_date asc nulls last, iq.created_at asc
     limit 1
     for update;

    if not found then
      raise exception 'WMS_NO_SOURCE_STOCK';
    end if;

    -- Evaluate batch mixing / consolidation conflicts in destination bin against server policy
    if v_consolidation = 'BY_BATCH' then
      if exists (
        select 1 from public.inventory_quants iq
         where iq.tenant_id = p_tenant
           and iq.bin_id = v_bin_id
           and iq.quantity_on_hand > 0
           and iq.product_id = v_product_id
           and iq.batch_number is distinct from v_quant.batch_number
      ) then
        raise exception 'WMS_CONSOLIDATION_CONFLICT';
      end if;
    elsif v_consolidation = 'NO' then
      if exists (
        select 1 from public.inventory_quants iq
         where iq.tenant_id = p_tenant
           and iq.bin_id = v_bin_id
           and iq.quantity_on_hand > 0
      ) then
        raise exception 'WMS_CONSOLIDATION_CONFLICT';
      end if;
    end if;

    insert into public.warehouse_tasks (
      tenant_id, warehouse_id, task_type, state, source_bin_id, destination_bin_id,
      hu_id, product_id, quantity, uom, idempotency_key, reject_detail
    ) values (
      p_tenant, v_warehouse_id, 'REPLENISH', 'READY', v_quant.bin_id, v_bin_id,
      v_quant.hu_id, v_product_id, v_qty, v_quant.uom, v_idem, v_fingerprint
    ) returning * into v_task;

    insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
    values (p_tenant, 'WAREHOUSE_TASK', v_task.id, 'REPLENISH', p_actor, 'FORNEXA_WMS', null, to_jsonb(v_task));

    return jsonb_build_object('ok', true, 'action', 'REPLENISH', 'task', to_jsonb(v_task));

  -- ── ACTION: CONTROL_STATE ──────────────────────────────────────────────────
  elsif p_action = 'CONTROL_STATE' then
    v_hu_id := (p_payload->>'hu_id')::uuid;
    select * into v_hu
      from public.handling_units hu
     where hu.tenant_id = p_tenant and hu.id = v_hu_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    if (p_payload ? 'warehouse_id') and nullif(p_payload->>'warehouse_id', '') is not null
       and (p_payload->>'warehouse_id')::uuid <> v_hu.warehouse_id then
      raise exception 'WMS_CROSS_WAREHOUSE_INVALID';
    end if;

    if v_hu.state = 'LOADED' then
      raise exception 'WMS_FORBIDDEN';
    end if;

    if v_hu.state not in ('STAGING_UNCHECKED', 'STAGING_CHECKED', 'PICKED_STAGED') then
      raise exception 'WMS_NOT_READY_TO_LOAD';
    end if;

    -- MUST-3: Explicit status is strictly mandatory. Omission, empty, or unknown status raises WMS_FORBIDDEN fail-closed.
    v_control_status := upper(nullif(trim(p_payload->>'status'), ''));
    if v_control_status is null or v_control_status not in ('PASSED', 'REJECTED') then
      raise exception 'WMS_FORBIDDEN';
    end if;

    if v_control_status = 'REJECTED' then
      -- Ambiguity (a): Atomic REJECTED inspection does NOT throw SQL exception.
      -- Atomically updates HU and linked quants to QUARANTINE or DAMAGED.
      -- SHOULD-B: Variables hoisted to top-level DECLARE.
      -- SHOULD-C: Strict disposition derivation (QUARANTINE default, DAMAGED if explicit) without text sniffing.
      v_disposition := upper(trim(coalesce(p_payload->>'disposition', '')));
      if v_disposition not in ('QUARANTINE', 'DAMAGED') then
        v_disposition := 'QUARANTINE';
      end if;
      v_rej_state := v_disposition;

      update public.handling_units
         set state = v_rej_state,
             state_controlled_at = null,
             state_controlled_by = null,
             updated_at = v_ts
       where tenant_id = p_tenant and id = v_hu.id
       returning * into v_hu;

      update public.inventory_quants
         set flow_state = v_rej_state,
             stock_status = case when v_rej_state = 'DAMAGED' then 'DAMAGED' else 'QUARANTINE' end,
             updated_at = v_ts
       where tenant_id = p_tenant and hu_id = v_hu.id;

      insert into public.warehouse_tasks (
        tenant_id, warehouse_id, task_type, state, hu_id, idempotency_key,
        reject_code, reject_detail, started_at, completed_at
      ) values (
        p_tenant, v_hu.warehouse_id, 'CONTROL_STATE', 'FAILED', v_hu.id, v_idem,
        coalesce(nullif(p_payload->>'reject_code', ''), 'PHYSICAL_CHECK_FAILED'),
        v_fingerprint,
        v_ts, v_ts
      ) returning * into v_task;

      insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
      values (p_tenant, 'HANDLING_UNIT', v_hu.id, 'CONTROL_STATE_REJECTED', p_actor, 'FORNEXA_WMS', v_before, to_jsonb(v_hu));

      return jsonb_build_object('ok', true, 'action', 'CONTROL_STATE', 'status', 'REJECTED', 'hu', to_jsonb(v_hu), 'task_id', v_task.id);
    elsif v_control_status = 'PASSED' then
      -- PASSED: set marks and leave state intact (allows authorized re-control with full audit trail)
      update public.handling_units
         set state_controlled_at = v_ts,
             state_controlled_by = p_actor,
             updated_at = v_ts
       where tenant_id = p_tenant and id = v_hu.id
       returning * into v_hu;

      insert into public.warehouse_tasks (
        tenant_id, warehouse_id, task_type, state, hu_id, idempotency_key,
        reject_detail, started_at, completed_at
      ) values (
        p_tenant, v_hu.warehouse_id, 'CONTROL_STATE', 'DONE', v_hu.id, v_idem,
        v_fingerprint, v_ts, v_ts
      ) returning * into v_task;

      insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
      values (p_tenant, 'HANDLING_UNIT', v_hu.id, 'CONTROL_STATE', p_actor, 'FORNEXA_WMS', v_before, to_jsonb(v_hu));

      return jsonb_build_object('ok', true, 'action', 'CONTROL_STATE', 'status', 'PASSED', 'hu', to_jsonb(v_hu), 'task_id', v_task.id);
    end if;

  -- ── ACTION: LABEL ──────────────────────────────────────────────────────────
  elsif p_action = 'LABEL' then
    v_hu_id := (p_payload->>'hu_id')::uuid;
    select * into v_hu
      from public.handling_units hu
     where hu.tenant_id = p_tenant and hu.id = v_hu_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    if (p_payload ? 'warehouse_id') and nullif(p_payload->>'warehouse_id', '') is not null
       and (p_payload->>'warehouse_id')::uuid <> v_hu.warehouse_id then
      raise exception 'WMS_CROSS_WAREHOUSE_INVALID';
    end if;

    if v_hu.state <> 'PICKED_STAGED' then
      raise exception 'WMS_NOT_READY_TO_LOAD';
    end if;

    v_policy := public.fornexa_wms_effective_policy(p_tenant, v_hu.warehouse_id, v_hu.owner_party_id, null);

    -- C-3: Server-side physical state control check
    if public.fornexa_wms_policy_bool(v_policy, 'require_state_control_on_load', true) then
      if v_hu.state_controlled_at is null then
        raise exception 'WMS_CONTROL_PENDING';
      end if;
    end if;

    -- C-3: Server-side expected weight & volume computation from contents + products
    select coalesce(sum(p.gross_weight_kg * huc.quantity), 0),
           coalesce(sum(p.volume_m3 * huc.quantity), 0)
      into v_computed_weight, v_computed_volume
      from public.handling_unit_contents huc
      join public.products p on p.id = huc.product_id and p.tenant_id = p_tenant
     where huc.tenant_id = p_tenant and huc.handling_unit_id = v_hu.id;

    v_expected_weight := case when v_computed_weight > 0 then v_computed_weight else v_hu.gross_weight_kg end;
    v_expected_volume := case when v_computed_volume > 0 then v_computed_volume else v_hu.volume_m3 end;

    v_measured_weight := nullif(p_payload->>'measured_weight_kg', '')::numeric(10,3);
    v_measured_volume := nullif(p_payload->>'measured_volume_m3', '')::numeric(10,4);
    v_weight_tol := coalesce((v_policy->>'weight_tolerance_pct')::numeric(6,2), 5.0);
    v_vol_tol := coalesce((v_policy->>'volume_tolerance_pct')::numeric(6,2), 10.0);

    v_req_weight := public.fornexa_wms_policy_bool(v_policy, 'require_weight_measurement', false);
    v_req_vol := public.fornexa_wms_policy_bool(v_policy, 'require_volume_measurement', false);

    if v_req_weight then
      if v_measured_weight is null then
        if v_hu.measured_at is not null and v_hu.gross_weight_kg is not null and v_hu.gross_weight_kg > 0 then
          v_measured_weight := v_hu.gross_weight_kg;
        else
          raise exception 'WMS_WEIGHT_TOLERANCE';
        end if;
      end if;
      if v_expected_weight is null or v_expected_weight <= 0 then
        raise exception 'WMS_WEIGHT_TOLERANCE';
      elsif abs(v_measured_weight - v_expected_weight) / v_expected_weight * 100.0 > v_weight_tol then
        raise exception 'WMS_WEIGHT_TOLERANCE';
      end if;
    elsif v_measured_weight is not null then
      if v_expected_weight is null or v_expected_weight <= 0 then
        raise exception 'WMS_WEIGHT_TOLERANCE';
      elsif abs(v_measured_weight - v_expected_weight) / v_expected_weight * 100.0 > v_weight_tol then
        raise exception 'WMS_WEIGHT_TOLERANCE';
      end if;
    end if;

    if v_req_vol then
      if v_measured_volume is null then
        if v_hu.measured_at is not null and v_hu.volume_m3 is not null and v_hu.volume_m3 > 0 then
          v_measured_volume := v_hu.volume_m3;
        else
          raise exception 'WMS_VOLUME_TOLERANCE';
        end if;
      end if;
      if v_expected_volume is null or v_expected_volume <= 0 then
        raise exception 'WMS_VOLUME_TOLERANCE';
      elsif abs(v_measured_volume - v_expected_volume) / v_expected_volume * 100.0 > v_vol_tol then
        raise exception 'WMS_VOLUME_TOLERANCE';
      end if;
    elsif v_measured_volume is not null then
      if v_expected_volume is null or v_expected_volume <= 0 then
        raise exception 'WMS_VOLUME_TOLERANCE';
      elsif abs(v_measured_volume - v_expected_volume) / v_expected_volume * 100.0 > v_vol_tol then
        raise exception 'WMS_VOLUME_TOLERANCE';
      end if;
    end if;

    v_before := to_jsonb(v_hu);

    update public.handling_units
       set label_issued_at = v_ts,
           gross_weight_kg = coalesce(v_measured_weight, gross_weight_kg),
           volume_m3 = coalesce(v_measured_volume, volume_m3),
           measured_at = case when v_measured_weight is not null or v_measured_volume is not null then v_ts else measured_at end,
           measured_by = case when v_measured_weight is not null or v_measured_volume is not null then p_actor else measured_by end,
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_hu.id
     returning * into v_hu;

    insert into public.warehouse_tasks (
      tenant_id, warehouse_id, task_type, state, hu_id, idempotency_key, reject_detail, started_at, completed_at
    ) values (
      p_tenant, v_hu.warehouse_id, 'LABEL', 'DONE', v_hu.id, v_idem, v_fingerprint, v_ts, v_ts
    ) returning * into v_task;

    insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
    values (p_tenant, 'HANDLING_UNIT', v_hu.id, 'LABEL', p_actor, 'FORNEXA_WMS', v_before, to_jsonb(v_hu));

    return jsonb_build_object('ok', true, 'action', 'LABEL', 'hu', to_jsonb(v_hu), 'task_id', v_task.id);

  -- ── ACTION: LOAD ───────────────────────────────────────────────────────────
  elsif p_action = 'LOAD' then
    v_hu_id := (p_payload->>'hu_id')::uuid;
    select * into v_hu
      from public.handling_units hu
     where hu.tenant_id = p_tenant and hu.id = v_hu_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    if (p_payload ? 'warehouse_id') and nullif(p_payload->>'warehouse_id', '') is not null
       and (p_payload->>'warehouse_id')::uuid <> v_hu.warehouse_id then
      raise exception 'WMS_CROSS_WAREHOUSE_INVALID';
    end if;

    v_policy := public.fornexa_wms_effective_policy(p_tenant, v_hu.warehouse_id, v_hu.owner_party_id, null);

    if v_hu.state <> 'PICKED_STAGED' then
      if public.fornexa_wms_policy_bool(v_policy, 'allow_cross_dock', false) and v_hu.state = 'STAGING_CHECKED' then
        -- authorized cross dock allowed
      else
        raise exception 'WMS_NOT_READY_TO_LOAD';
      end if;
    end if;

    if v_hu.label_issued_at is null then
      raise exception 'WMS_LABEL_MISSING';
    end if;

    v_scanned_code := nullif(trim(coalesce(p_payload->>'scanned_code', p_payload->>'label_code', '')), '');
    if public.fornexa_wms_policy_bool(v_policy, 'require_label_scan_on_load', true) then
      if v_scanned_code is null or v_scanned_code <> v_hu.code then
        raise exception 'WMS_LABEL_MISMATCH';
      end if;
    end if;

    -- C-3: Server-side physical state control check
    if public.fornexa_wms_policy_bool(v_policy, 'require_state_control_on_load', true) then
      if v_hu.state_controlled_at is null then
        raise exception 'WMS_CONTROL_PENDING';
      end if;
    end if;

    -- C-3: Server-side expected weight & volume computation from contents + products
    select coalesce(sum(p.gross_weight_kg * huc.quantity), 0),
           coalesce(sum(p.volume_m3 * huc.quantity), 0)
      into v_computed_weight, v_computed_volume
      from public.handling_unit_contents huc
      join public.products p on p.id = huc.product_id and p.tenant_id = p_tenant
     where huc.tenant_id = p_tenant and huc.handling_unit_id = v_hu.id;

    v_expected_weight := case when v_computed_weight > 0 then v_computed_weight else v_hu.gross_weight_kg end;
    v_expected_volume := case when v_computed_volume > 0 then v_computed_volume else v_hu.volume_m3 end;

    v_measured_weight := nullif(p_payload->>'measured_weight_kg', '')::numeric(10,3);
    v_measured_volume := nullif(p_payload->>'measured_volume_m3', '')::numeric(10,4);
    v_weight_tol := coalesce((v_policy->>'weight_tolerance_pct')::numeric(6,2), 5.0);
    v_vol_tol := coalesce((v_policy->>'volume_tolerance_pct')::numeric(6,2), 10.0);

    v_req_weight := public.fornexa_wms_policy_bool(v_policy, 'require_weight_measurement', false);
    v_req_vol := public.fornexa_wms_policy_bool(v_policy, 'require_volume_measurement', false);

    if v_req_weight then
      if v_measured_weight is null then
        if v_hu.measured_at is not null and v_hu.gross_weight_kg is not null and v_hu.gross_weight_kg > 0 then
          v_measured_weight := v_hu.gross_weight_kg;
        else
          raise exception 'WMS_WEIGHT_TOLERANCE';
        end if;
      end if;
      if v_expected_weight is null or v_expected_weight <= 0 then
        raise exception 'WMS_WEIGHT_TOLERANCE';
      elsif abs(v_measured_weight - v_expected_weight) / v_expected_weight * 100.0 > v_weight_tol then
        raise exception 'WMS_WEIGHT_TOLERANCE';
      end if;
    elsif v_measured_weight is not null then
      if v_expected_weight is null or v_expected_weight <= 0 then
        raise exception 'WMS_WEIGHT_TOLERANCE';
      elsif abs(v_measured_weight - v_expected_weight) / v_expected_weight * 100.0 > v_weight_tol then
        raise exception 'WMS_WEIGHT_TOLERANCE';
      end if;
    end if;

    if v_req_vol then
      if v_measured_volume is null then
        if v_hu.measured_at is not null and v_hu.volume_m3 is not null and v_hu.volume_m3 > 0 then
          v_measured_volume := v_hu.volume_m3;
        else
          raise exception 'WMS_VOLUME_TOLERANCE';
        end if;
      end if;
      if v_expected_volume is null or v_expected_volume <= 0 then
        raise exception 'WMS_VOLUME_TOLERANCE';
      elsif abs(v_measured_volume - v_expected_volume) / v_expected_volume * 100.0 > v_vol_tol then
        raise exception 'WMS_VOLUME_TOLERANCE';
      end if;
    elsif v_measured_volume is not null then
      if v_expected_volume is null or v_expected_volume <= 0 then
        raise exception 'WMS_VOLUME_TOLERANCE';
      elsif abs(v_measured_volume - v_expected_volume) / v_expected_volume * 100.0 > v_vol_tol then
        raise exception 'WMS_VOLUME_TOLERANCE';
      end if;
    end if;

    v_before := to_jsonb(v_hu);

    update public.handling_units
       set state = 'LOADED',
           current_bin_id = null,
           current_dock_id = coalesce(nullif(p_payload->>'dock_id', '')::uuid, current_dock_id),
           gross_weight_kg = coalesce(v_measured_weight, gross_weight_kg),
           volume_m3 = coalesce(v_measured_volume, volume_m3),
           measured_at = case when v_measured_weight is not null or v_measured_volume is not null then v_ts else measured_at end,
           measured_by = case when v_measured_weight is not null or v_measured_volume is not null then p_actor else measured_by end,
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_hu.id
     returning * into v_hu;

    update public.inventory_quants
       set flow_state = 'LOADED',
           updated_at = v_ts
     where tenant_id = p_tenant and hu_id = v_hu.id;

    select huc.product_id, huc.batch_number, huc.serial_number, huc.quantity, huc.uom
      into v_product_id, v_batch, v_serial, v_qty, v_uom
      from public.handling_unit_contents huc
     where huc.tenant_id = p_tenant and huc.handling_unit_id = v_hu.id
     limit 1;

    if v_product_id is not null then
      insert into public.inventory_movements (
        tenant_id, warehouse_id, movement_type, product_id, source_bin_id,
        quantity, uom, owner_party_id, batch_number, serial_number,
        reference_order_id, operator_id, started_at, completed_at, status, notes
      ) values (
        p_tenant, v_hu.warehouse_id, 'SHIPMENT', v_product_id, (v_before->>'current_bin_id')::uuid,
        v_qty, v_uom, v_hu.owner_party_id, v_batch, v_serial,
        nullif(p_payload->>'order_id', '')::uuid, p_actor::text, v_ts, v_ts, 'COMPLETED', 'LOAD ' || v_hu.code
      );
    end if;

    insert into public.warehouse_tasks (
      tenant_id, warehouse_id, task_type, state, hu_id, product_id, quantity, uom,
      idempotency_key, reject_detail, started_at, completed_at
    ) values (
      p_tenant, v_hu.warehouse_id, 'LOAD', 'DONE', v_hu.id, v_product_id, v_qty, v_uom,
      v_idem, v_fingerprint, v_ts, v_ts
    ) returning * into v_task;

    insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
    values (p_tenant, 'HANDLING_UNIT', v_hu.id, 'LOAD', p_actor, 'FORNEXA_WMS', v_before, to_jsonb(v_hu));

    return jsonb_build_object('ok', true, 'action', 'LOAD', 'hu', to_jsonb(v_hu), 'task_id', v_task.id);

  -- ── ACTION: UPSERT_POLICY (versioned replacement) ──────────────────────────
  elsif p_action = 'UPSERT_POLICY' then
    if v_role not in ('OWNER','ADMIN','PLANNER') then
      raise exception 'WMS_FORBIDDEN';
    end if;
    v_warehouse_id := (p_payload->>'warehouse_id')::uuid;
    update public.warehouse_behavior_policies
       set superseded_at = v_ts,
           updated_at = v_ts
     where tenant_id = p_tenant
       and warehouse_id = v_warehouse_id
       and scope = coalesce(p_payload->>'scope', 'WAREHOUSE')
       and coalesce(owner_party_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(nullif(p_payload->>'owner_party_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
       and coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(nullif(p_payload->>'product_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
       and coalesce(category_code, '') = coalesce(nullif(p_payload->>'category_code', ''), '')
       and superseded_at is null
     returning to_jsonb(warehouse_behavior_policies.*) into v_before;

    insert into public.warehouse_behavior_policies (
      tenant_id, warehouse_id, owner_party_id, scope, product_id, category_code,
      policy_version, effective_from, superseded_at, params
    ) values (
      p_tenant, v_warehouse_id, nullif(p_payload->>'owner_party_id', '')::uuid,
      coalesce(p_payload->>'scope', 'WAREHOUSE'), nullif(p_payload->>'product_id', '')::uuid,
      nullif(p_payload->>'category_code', ''),
      coalesce((v_before->>'policy_version')::int + 1, 1),
      v_ts, null, coalesce(p_payload->'params', '{}'::jsonb)
    ) returning to_jsonb(warehouse_behavior_policies.*) into v_after;

    insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
    values (p_tenant, 'WAREHOUSE_BEHAVIOR_POLICY', (v_after->>'id')::uuid, 'UPSERT_POLICY', p_actor, 'FORNEXA_WMS', v_before, v_after);

    return jsonb_build_object('ok', true, 'action', 'UPSERT_POLICY', 'policy', v_after);

  else
    raise exception 'WMS_FORBIDDEN';
  end if;
end;
$$;

-- ── 4. Rollout Safety: Default Active Warehouse Policies to Require State Control (MUST-1) ──
-- NOTA DE SEGURIDAD OPERATIVA Y TRANSACCIONAL:
-- Esta migración debe ejecutarse dentro de un bloque transaccional atómico único (BEGIN ... COMMIT).
-- El backfill de require_state_control_on_load se ubica al final de la migración para asegurar que
-- la función fornexa_wms_action ya incorpore el soporte de CONTROL_STATE y validación de carga antes
-- de activar el requisito en las políticas activas preexistentes.
update public.warehouse_behavior_policies
   set params = jsonb_set(params, '{require_state_control_on_load}', 'true'::jsonb, true)
 where params is not null
   and (params->>'require_state_control_on_load' is null or params->>'require_state_control_on_load' = '');

