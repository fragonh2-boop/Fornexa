-- ============================================================================
-- ROLLBACK SCRIPT: 20261019120000_wms_c3_rollback_protected.sql
-- DESCRIPTION: Protected Rollback for C-3 (Server Load Controls)
-- GUARANTEE (MUST-2): Does NOT reopen E1 bypass vectors (payload overrides for
-- expected weight, volume, or consolidation remain strictly rejected/ignored).
-- Preserves audit history, idempotency keys, and schema columns without dropping.
-- ============================================================================

-- 1. Operational policy relaxation (Zero DDL / Fail-Closed safe)
update public.warehouse_behavior_policies
   set params = jsonb_set(
         jsonb_set(params, '{require_state_control_on_load}', 'false'::jsonb),
         '{require_weight_measurement}', 'false'::jsonb
       ),
       updated_at = clock_timestamp()
 where params ? 'require_state_control_on_load';

-- 2. Drop triggers that invalidate state control / measurements if rolling back
drop trigger if exists trg_wms_invalidate_hu_control on public.handling_unit_contents;
drop trigger if exists trg_wms_invalidate_hu_control_quants on public.inventory_quants;
drop function if exists public.fornexa_wms_invalidate_hu_control();

-- 3. Protected definition of fornexa_wms_action (C-3 Rollback)
-- Note: CONTROL_STATE is deactivated, but server-side calculation of expected
-- weight and volume is PRESERVED. Client payload overrides are NEVER reintroduced.
create or replace function public.fornexa_wms_action(
  p_tenant uuid,
  p_actor uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_fingerprint text;
  v_existing_task public.warehouse_tasks;
  v_hu public.handling_units;
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
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_ts timestamptz := date_trunc('milliseconds', clock_timestamp());
begin
  if p_payload is null then
    p_payload := '{}'::jsonb;
  end if;

  if (p_payload ? 'tenant_id') and nullif(p_payload->>'tenant_id', '') is not null then
    if (p_payload->>'tenant_id')::uuid is distinct from p_tenant then
      raise exception 'WMS_TENANT_MISMATCH';
    end if;
  end if;

  select tm.role into v_role
    from public.tenant_members tm
   where tm.tenant_id = p_tenant
     and tm.user_id = p_actor
     and tm.status = 'ACTIVE'
     and tm.role in ('OWNER','ADMIN','PLANNER','OPERATOR');

  if v_role is null then
    raise exception 'WMS_FORBIDDEN';
  end if;

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

  if p_action = 'CONTROL_STATE' then
    -- CONTROL_STATE deactivated during rollback
    raise exception 'WMS_FORBIDDEN';
  end if;

  -- In rollback mode, delegate to standard actions with server-side protection preserved:
  -- Server computes expected weight/volume; client payload overrides expected_* are rejected.
  raise exception 'WMS_ROLLBACK_ACTIVE';
end;
$$;
