-- ============================================================================
-- MIGRATION: 20261024120100_wms_e2_replenishment_rpc.sql
-- DESCRIPTION: WMS E2 Internal Replenishment RPCs, Min/Max Evaluator, and fornexa_wms_action Extension
-- AUTHOR: Gemini (Fornexa)
-- DATE: 2026-10-24
-- CONTRACT: docs/architecture/wms-e2-replenishment-technical-contract.md (HEAD b03ad954)
-- ============================================================================

begin;

-- ── 1. RPC: fornexa_wms_evaluate_replenishment ──────────────────────────────
create or replace function public.fornexa_wms_evaluate_replenishment(
  p_tenant uuid,
  p_actor uuid,
  p_warehouse_id uuid,
  p_rule_id uuid default null,
  p_order_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_r record;
  v_stock_fisico_libre numeric(12,3);
  v_stock_en_transito numeric(12,3);
  v_stock_destino numeric(12,3);
  v_deficit numeric(12,3);
  v_multiplo_inferior numeric(12,3);
  v_suggested_qty numeric(12,3);
  v_policy jsonb;
  v_rotation text;
  v_consolidation text;
  v_dest_bin public.warehouse_bins;
  v_candidate_quant public.inventory_quants;
  v_prod public.products;
  v_status text;
  v_rejection_reason text;
  v_target_hu_id uuid;
  v_incoming_pallets_delta integer;
  v_dest_hu_id uuid;
  v_cur_weight numeric(12,3);
  v_transit_weight numeric(12,3);
  v_incoming_weight numeric(12,3);
  v_cur_vol numeric(12,4);
  v_transit_vol numeric(12,4);
  v_incoming_vol numeric(12,4);
  v_cur_pallets integer;
  v_transit_pallets integer;
  v_has_diff_product boolean;
  v_has_any_stock boolean;
  v_proposal public.wms_proposals;
  v_proposals jsonb := '[]'::jsonb;
begin
  -- Validate actor role
  select tm.role into v_role
    from public.tenant_members tm
   where tm.tenant_id = p_tenant
     and tm.user_id = p_actor
     and tm.status = 'ACTIVE'
     and tm.role in ('OWNER','ADMIN','PLANNER');

  if v_role is null then
    raise exception 'WMS_FORBIDDEN';
  end if;

  -- Validate warehouse
  if not exists (select 1 from public.warehouses where tenant_id = p_tenant and id = p_warehouse_id) then
    raise exception 'WMS_FORBIDDEN';
  end if;

  -- Iterate over candidate rules
  for v_r in
    select *
      from public.replenishment_rules
     where tenant_id = p_tenant
       and warehouse_id = p_warehouse_id
       and active = true
       and (p_rule_id is null or id = p_rule_id)
     order by created_at asc
  loop
    -- MUST-5 Convergence check: skip if active proposal already exists
    if exists (
      select 1
        from public.wms_proposals wp
       where wp.tenant_id = p_tenant
         and wp.warehouse_id = v_r.warehouse_id
         and wp.product_id = v_r.product_id
         and wp.destination_bin_id = v_r.destination_bin_id
         and wp.status in ('DRAFT', 'APPROVED')
         and (p_order_id is null or wp.order_id = p_order_id)
    ) then
      continue;
    end if;

    -- Calculate destination free physical stock
    select coalesce(sum(iq.quantity_on_hand - iq.quantity_reserved), 0)
      into v_stock_fisico_libre
      from public.inventory_quants iq
     where iq.tenant_id = p_tenant
       and iq.bin_id = v_r.destination_bin_id
       and iq.product_id = v_r.product_id
       and iq.stock_status = 'AVAILABLE';

    -- Calculate destination in-transit stock
    select coalesce(sum(wp.suggested_quantity), 0)
      into v_stock_en_transito
      from public.wms_proposals wp
     where wp.tenant_id = p_tenant
       and wp.destination_bin_id = v_r.destination_bin_id
       and wp.product_id = v_r.product_id
       and wp.status in ('DRAFT', 'APPROVED');

    v_stock_destino := v_stock_fisico_libre + v_stock_en_transito;

    -- Trigger condition: stock_destino <= min_quantity
    if v_stock_destino <= v_r.min_quantity then
      v_deficit := v_r.max_quantity - v_stock_destino;
      v_multiplo_inferior := floor(v_deficit / v_r.reorder_quantity) * v_r.reorder_quantity;
      if v_multiplo_inferior > 0 then
        v_suggested_qty := v_multiplo_inferior;
      else
        v_suggested_qty := least(v_r.reorder_quantity, v_deficit);
      end if;

      if v_suggested_qty <= 0 then
        continue;
      end if;

      -- Effective warehouse policy
      v_policy := public.fornexa_wms_effective_policy(p_tenant, v_r.warehouse_id, null, v_r.product_id);
      v_rotation := coalesce(v_policy->>'rotation', 'FEFO');
      v_consolidation := coalesce(v_r.consolidation, v_policy->>'consolidation', 'YES');

      -- Check destination bin
      select * into v_dest_bin
        from public.warehouse_bins
       where tenant_id = p_tenant
         and id = v_r.destination_bin_id
         and is_active = true
         and is_blocked = false;

      if not found then
        continue;
      end if;

      -- Check destination stock state for consolidation
      select exists (
        select 1 from public.inventory_quants
         where tenant_id = p_tenant
           and bin_id = v_r.destination_bin_id
           and product_id <> v_r.product_id
           and quantity_on_hand > 0
      ) into v_has_diff_product;

      select exists (
        select 1 from public.inventory_quants
         where tenant_id = p_tenant
           and bin_id = v_r.destination_bin_id
           and quantity_on_hand > 0
      ) into v_has_any_stock;

      v_status := 'DRAFT';
      v_rejection_reason := null;

      if v_consolidation = 'NO' and v_has_any_stock then
        v_status := 'REJECTED';
        v_rejection_reason := 'WMS_CONSOLIDATION_CONFLICT';
      elsif v_consolidation = 'YES' and v_has_diff_product then
        v_status := 'REJECTED';
        v_rejection_reason := 'WMS_CONSOLIDATION_CONFLICT';
      end if;

      -- Select candidate source quant according to rotation policy
      select iq.* into v_candidate_quant
        from public.inventory_quants iq
        join public.warehouse_bins wb on wb.tenant_id = iq.tenant_id and wb.id = iq.bin_id
       where iq.tenant_id = p_tenant
         and iq.warehouse_id = v_r.warehouse_id
         and iq.product_id = v_r.product_id
         and iq.stock_status = 'AVAILABLE'
         and iq.flow_state in ('STORED', 'RESERVED')
         and (iq.quantity_on_hand - iq.quantity_reserved) >= v_suggested_qty
         and iq.bin_id <> v_r.destination_bin_id
         and wb.is_active = true
         and wb.is_blocked = false
       order by
         case when v_rotation = 'FIFO' then iq.received_at end asc nulls first,
         case when v_rotation = 'FEFO' then iq.expiry_date end asc nulls last,
         case when v_rotation = 'FEFO' then iq.received_at end asc nulls first,
         case when v_rotation = 'LIFO' then iq.received_at end desc nulls last,
         case when v_rotation = 'LIFO' then iq.created_at end desc,
         iq.created_at asc,
         iq.id asc
       limit 1;

      if v_candidate_quant.id is null then
        -- No source stock found
        if p_rule_id is not null then
          raise exception 'WMS_NO_SOURCE_STOCK';
        end if;
        continue;
      end if;

      -- Check BY_BATCH consolidation mode against candidate batch
      if v_consolidation = 'BY_BATCH' then
        if exists (
          select 1 from public.inventory_quants
           where tenant_id = p_tenant
             and bin_id = v_r.destination_bin_id
             and product_id = v_r.product_id
             and quantity_on_hand > 0
             and batch_number is distinct from v_candidate_quant.batch_number
        ) then
          v_status := 'REJECTED';
          v_rejection_reason := 'WMS_LOT_MIX_FORBIDDEN';
        end if;
      end if;

      -- Determine target_hu_id and incoming pallet delta (NOTE-IMPL-1 & S4)
      if v_candidate_quant.hu_id is not null and v_candidate_quant.quantity_on_hand = v_suggested_qty then
        v_target_hu_id := v_candidate_quant.hu_id;
        v_incoming_pallets_delta := 1;
      else
        select hu_id into v_dest_hu_id
          from public.inventory_quants
         where tenant_id = p_tenant
           and bin_id = v_r.destination_bin_id
           and hu_id is not null
           and quantity_on_hand > 0
         limit 1;

        if v_dest_hu_id is not null and v_consolidation in ('YES', 'BY_BATCH') then
          v_target_hu_id := v_dest_hu_id;
          v_incoming_pallets_delta := 0;
        elsif v_dest_bin.max_pallets is not null then
          v_target_hu_id := gen_random_uuid();
          v_incoming_pallets_delta := 1;
        else
          v_target_hu_id := null;
          v_incoming_pallets_delta := 0;
        end if;
      end if;

      -- Physical Bin Capacity check (WMS_BIN_CAPACITY with editable SGA data)
      select * into v_prod
        from public.products
       where tenant_id = p_tenant and id = v_r.product_id;

      -- 1. Weight check
      if v_dest_bin.max_weight_kg is not null then
        select coalesce(sum(iq.quantity_on_hand * coalesce(p.gross_weight_kg, 0)), 0)
          into v_cur_weight
          from public.inventory_quants iq
          join public.products p on p.tenant_id = iq.tenant_id and p.id = iq.product_id
         where iq.tenant_id = p_tenant
           and iq.bin_id = v_r.destination_bin_id
           and iq.quantity_on_hand > 0;

        select coalesce(sum(wp.suggested_quantity * coalesce(p.gross_weight_kg, 0)), 0)
          into v_transit_weight
          from public.wms_proposals wp
          join public.products p on p.tenant_id = wp.tenant_id and p.id = wp.product_id
         where wp.tenant_id = p_tenant
           and wp.destination_bin_id = v_r.destination_bin_id
           and wp.status in ('DRAFT', 'APPROVED');

        v_incoming_weight := v_suggested_qty * coalesce(v_prod.gross_weight_kg, 0);

        if (v_cur_weight + v_transit_weight + v_incoming_weight) > v_dest_bin.max_weight_kg then
          v_status := 'REJECTED';
          v_rejection_reason := 'WMS_BIN_CAPACITY';
        end if;
      end if;

      -- 2. Volume check
      if v_dest_bin.max_volume_m3 is not null then
        select coalesce(sum(iq.quantity_on_hand * coalesce(p.volume_m3, 0)), 0)
          into v_cur_vol
          from public.inventory_quants iq
          join public.products p on p.tenant_id = iq.tenant_id and p.id = iq.product_id
         where iq.tenant_id = p_tenant
           and iq.bin_id = v_r.destination_bin_id
           and iq.quantity_on_hand > 0;

        select coalesce(sum(wp.suggested_quantity * coalesce(p.volume_m3, 0)), 0)
          into v_transit_vol
          from public.wms_proposals wp
          join public.products p on p.tenant_id = wp.tenant_id and p.id = wp.product_id
         where wp.tenant_id = p_tenant
           and wp.destination_bin_id = v_r.destination_bin_id
           and wp.status in ('DRAFT', 'APPROVED');

        v_incoming_vol := v_suggested_qty * coalesce(v_prod.volume_m3, 0);

        if (v_cur_vol + v_transit_vol + v_incoming_vol) > v_dest_bin.max_volume_m3 then
          v_status := 'REJECTED';
          v_rejection_reason := 'WMS_BIN_CAPACITY';
        end if;
      end if;

      -- 3. Pallet check
      if v_dest_bin.max_pallets is not null then
        select count(distinct hu_id)
          into v_cur_pallets
          from public.inventory_quants
         where tenant_id = p_tenant
           and bin_id = v_r.destination_bin_id
           and hu_id is not null
           and quantity_on_hand > 0;

        select count(distinct coalesce(wp.target_hu_id, wp.source_hu_id))
          into v_transit_pallets
          from public.wms_proposals wp
         where wp.tenant_id = p_tenant
           and wp.destination_bin_id = v_r.destination_bin_id
           and wp.status in ('DRAFT', 'APPROVED')
           and coalesce(wp.target_hu_id, wp.source_hu_id) is not null
           and not exists (
             select 1 from public.inventory_quants iq
              where iq.tenant_id = p_tenant
                and iq.bin_id = v_r.destination_bin_id
                and iq.hu_id = coalesce(wp.target_hu_id, wp.source_hu_id)
                and iq.quantity_on_hand > 0
           );

        if (v_cur_pallets + v_transit_pallets + v_incoming_pallets_delta) > v_dest_bin.max_pallets then
          v_status := 'REJECTED';
          v_rejection_reason := 'WMS_BIN_CAPACITY';
        end if;
      end if;

      -- Insert proposal
      insert into public.wms_proposals (
        tenant_id, warehouse_id, rule_id, order_id, proposal_type,
        product_id, batch_number, source_bin_id, source_hu_id,
        source_quant_id, destination_bin_id, target_hu_id,
        suggested_quantity, uom, status, rejection_reason, created_by
      ) values (
        p_tenant, v_r.warehouse_id, v_r.id, p_order_id, 'REPLENISHMENT',
        v_r.product_id, v_candidate_quant.batch_number, v_candidate_quant.bin_id, v_candidate_quant.hu_id,
        v_candidate_quant.id, v_r.destination_bin_id, v_target_hu_id,
        v_suggested_qty, coalesce(v_candidate_quant.uom, 'UN'), v_status, v_rejection_reason, p_actor
      ) returning * into v_proposal;

      v_proposals := v_proposals || jsonb_build_array(to_jsonb(v_proposal));
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'proposals', v_proposals,
    'count', jsonb_array_length(v_proposals)
  );
end;
$$;

revoke all on function public.fornexa_wms_evaluate_replenishment(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fornexa_wms_evaluate_replenishment(uuid, uuid, uuid, uuid, uuid) to service_role;

-- ── 2. RPC: fornexa_wms_approve_proposal ────────────────────────────────────
create or replace function public.fornexa_wms_approve_proposal(
  p_tenant uuid,
  p_actor uuid,
  p_proposal_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_proposal public.wms_proposals;
  v_quant public.inventory_quants;
  v_res public.stock_reservations;
  v_task public.warehouse_tasks;
begin
  -- Validate actor role
  select tm.role into v_role
    from public.tenant_members tm
   where tm.tenant_id = p_tenant
     and tm.user_id = p_actor
     and tm.status = 'ACTIVE'
     and tm.role in ('OWNER','ADMIN','PLANNER');

  if v_role is null then
    raise exception 'WMS_FORBIDDEN';
  end if;

  -- Lock proposal
  select * into v_proposal
    from public.wms_proposals
   where tenant_id = p_tenant
     and id = p_proposal_id
     for update;

  if not found then
    raise exception 'WMS_NOT_FOUND';
  end if;

  if v_proposal.status <> 'DRAFT' then
    raise exception 'WMS_INVALID_STATE';
  end if;

  -- Lock source quant
  select * into v_quant
    from public.inventory_quants
   where tenant_id = p_tenant
     and id = v_proposal.source_quant_id
     for update;

  if not found or v_quant.stock_status <> 'AVAILABLE' then
    raise exception 'WMS_NO_SOURCE_STOCK';
  end if;

  if (v_quant.quantity_on_hand - v_quant.quantity_reserved) < v_proposal.suggested_quantity then
    raise exception 'WMS_NO_SOURCE_STOCK';
  end if;

  -- Update source quant reserved quantity
  update public.inventory_quants
     set quantity_reserved = quantity_reserved + v_proposal.suggested_quantity,
         flow_state = case when flow_state = 'STORED' then 'RESERVED' else flow_state end,
         updated_at = now()
   where id = v_quant.id;

  -- Create HELD reservation
  insert into public.stock_reservations (
    tenant_id, warehouse_id, product_id, batch_number, quant_id, quantity, uom,
    status, reference_type, reference_id, created_by
  ) values (
    p_tenant, v_proposal.warehouse_id, v_proposal.product_id, v_proposal.batch_number,
    v_proposal.source_quant_id, v_proposal.suggested_quantity, v_proposal.uom,
    'HELD', 'REPLENISHMENT_PROPOSAL', v_proposal.id, p_actor
  ) returning * into v_res;

  -- Create warehouse task
  insert into public.warehouse_tasks (
    tenant_id, warehouse_id, task_type, state, priority,
    product_id, batch_number, source_bin_id, destination_bin_id,
    hu_id, target_hu_id, quantity_expected, uom, proposal_id, created_by
  ) values (
    p_tenant, v_proposal.warehouse_id, 'REPLENISH', 'READY', 10,
    v_proposal.product_id, v_proposal.batch_number, v_proposal.source_bin_id, v_proposal.destination_bin_id,
    v_proposal.source_hu_id, v_proposal.target_hu_id, v_proposal.suggested_quantity, v_proposal.uom,
    v_proposal.id, p_actor
  ) returning * into v_task;

  -- Update proposal status
  update public.wms_proposals
     set status = 'APPROVED',
         approved_by = p_actor,
         task_id = v_task.id,
         updated_at = now()
   where id = v_proposal.id;

  -- Audit event
  insert into public.audit_events (
    tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data
  ) values (
    p_tenant, 'WMS_PROPOSAL', v_proposal.id, 'APPROVE_PROPOSAL', p_actor, 'FORNEXA_WMS',
    to_jsonb(v_proposal),
    jsonb_build_object('status', 'APPROVED', 'task_id', v_task.id, 'reservation_id', v_res.id)
  );

  return jsonb_build_object(
    'ok', true,
    'action', 'APPROVE_PROPOSAL',
    'proposal_id', v_proposal.id,
    'task_id', v_task.id,
    'reservation_id', v_res.id,
    'status', 'APPROVED'
  );
end;
$$;

revoke all on function public.fornexa_wms_approve_proposal(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fornexa_wms_approve_proposal(uuid, uuid, uuid) to service_role;

-- ── 3. RPC: fornexa_wms_reject_proposal ─────────────────────────────────────
create or replace function public.fornexa_wms_reject_proposal(
  p_tenant uuid,
  p_actor uuid,
  p_proposal_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_proposal public.wms_proposals;
begin
  -- Validate actor role
  select tm.role into v_role
    from public.tenant_members tm
   where tm.tenant_id = p_tenant
     and tm.user_id = p_actor
     and tm.status = 'ACTIVE'
     and tm.role in ('OWNER','ADMIN','PLANNER');

  if v_role is null then
    raise exception 'WMS_FORBIDDEN';
  end if;

  -- Lock proposal
  select * into v_proposal
    from public.wms_proposals
   where tenant_id = p_tenant
     and id = p_proposal_id
     for update;

  if not found then
    raise exception 'WMS_NOT_FOUND';
  end if;

  if v_proposal.status <> 'DRAFT' then
    raise exception 'WMS_INVALID_STATE';
  end if;

  update public.wms_proposals
     set status = 'REJECTED',
         rejection_reason = coalesce(p_reason, 'MANUALLY_REJECTED'),
         updated_at = now()
   where id = v_proposal.id;

  insert into public.audit_events (
    tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data
  ) values (
    p_tenant, 'WMS_PROPOSAL', v_proposal.id, 'REJECT_PROPOSAL', p_actor, 'FORNEXA_WMS',
    to_jsonb(v_proposal),
    jsonb_build_object('status', 'REJECTED', 'reason', coalesce(p_reason, 'MANUALLY_REJECTED'))
  );

  return jsonb_build_object(
    'ok', true,
    'action', 'REJECT_PROPOSAL',
    'proposal_id', v_proposal.id,
    'status', 'REJECTED'
  );
end;
$$;

revoke all on function public.fornexa_wms_reject_proposal(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fornexa_wms_reject_proposal(uuid, uuid, uuid, text) to service_role;

-- ── 4. RPC: fornexa_wms_cancel_proposal ─────────────────────────────────────
create or replace function public.fornexa_wms_cancel_proposal(
  p_tenant uuid,
  p_actor uuid,
  p_proposal_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_proposal public.wms_proposals;
  v_res public.stock_reservations;
begin
  -- Validate actor role
  select tm.role into v_role
    from public.tenant_members tm
   where tm.tenant_id = p_tenant
     and tm.user_id = p_actor
     and tm.status = 'ACTIVE'
     and tm.role in ('OWNER','ADMIN','PLANNER');

  if v_role is null then
    raise exception 'WMS_FORBIDDEN';
  end if;

  -- Lock proposal
  select * into v_proposal
    from public.wms_proposals
   where tenant_id = p_tenant
     and id = p_proposal_id
     for update;

  if not found then
    raise exception 'WMS_NOT_FOUND';
  end if;

  if v_proposal.status not in ('DRAFT', 'APPROVED') then
    raise exception 'WMS_INVALID_STATE';
  end if;

  -- If was APPROVED, release reservation and task
  if v_proposal.status = 'APPROVED' then
    select * into v_res
      from public.stock_reservations
     where tenant_id = p_tenant
       and reference_id = v_proposal.id
       and reference_type = 'REPLENISHMENT_PROPOSAL'
       and status = 'HELD'
       for update;

    if found then
      update public.stock_reservations
         set status = 'CANCELLED',
             released_at = now()
       where id = v_res.id;

      update public.inventory_quants
         set quantity_reserved = greatest(0, quantity_reserved - v_res.quantity),
             updated_at = now()
       where id = v_proposal.source_quant_id;
    end if;

    if v_proposal.task_id is not null then
      update public.warehouse_tasks
         set state = 'CANCELLED',
             completed_at = now()
       where id = v_proposal.task_id;
    end if;
  end if;

  update public.wms_proposals
     set status = 'CANCELLED',
         rejection_reason = coalesce(p_reason, 'MANUALLY_CANCELLED'),
         updated_at = now()
   where id = v_proposal.id;

  insert into public.audit_events (
    tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data
  ) values (
    p_tenant, 'WMS_PROPOSAL', v_proposal.id, 'CANCEL_PROPOSAL', p_actor, 'FORNEXA_WMS',
    to_jsonb(v_proposal),
    jsonb_build_object('status', 'CANCELLED', 'reason', coalesce(p_reason, 'MANUALLY_CANCELLED'))
  );

  return jsonb_build_object(
    'ok', true,
    'action', 'CANCEL_PROPOSAL',
    'proposal_id', v_proposal.id,
    'status', 'CANCELLED'
  );
end;
$$;

revoke all on function public.fornexa_wms_cancel_proposal(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fornexa_wms_cancel_proposal(uuid, uuid, uuid, text) to service_role;

-- ── 5. RPC: fornexa_wms_replenish ───────────────────────────────────────────
create or replace function public.fornexa_wms_replenish(
  p_tenant uuid,
  p_actor uuid,
  p_proposal_id uuid,
  p_idempotency_key text default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_fingerprint text;
  v_proposal public.wms_proposals;
  v_quant public.inventory_quants;
  v_dest_quant public.inventory_quants;
  v_res public.stock_reservations;
  v_result jsonb;
begin
  if p_payload is null then
    p_payload := '{}'::jsonb;
  end if;

  -- Validate actor role
  select tm.role into v_role
    from public.tenant_members tm
   where tm.tenant_id = p_tenant
     and tm.user_id = p_actor
     and tm.status = 'ACTIVE'
     and tm.role in ('OWNER','ADMIN','OPERATOR');

  if v_role is null then
    raise exception 'WMS_FORBIDDEN';
  end if;

  -- Compute deterministic payload fingerprint (MUST-3)
  v_fingerprint := md5(
    coalesce(p_tenant::text, '') || ':' ||
    'REPLENISH' || ':' ||
    coalesce(p_idempotency_key, '') || ':' ||
    coalesce(p_payload::text, '')
  );

  -- 1. Early idempotency check
  if p_idempotency_key is not null then
    select * into v_proposal
      from public.wms_proposals
     where tenant_id = p_tenant
       and id = p_proposal_id
       for update;

    if found and v_proposal.idempotency_key = p_idempotency_key then
      if v_proposal.idempotency_fingerprint is distinct from v_fingerprint then
        raise exception 'WMS_DUPLICATE_KEY_PAYLOAD_MISMATCH';
      end if;
      if v_proposal.status = 'EXECUTED' and v_proposal.execution_result is not null then
        return v_proposal.execution_result || jsonb_build_object('idempotent_replay', true);
      end if;
    end if;
  else
    select * into v_proposal
      from public.wms_proposals
     where tenant_id = p_tenant
       and id = p_proposal_id
       for update;
  end if;

  if v_proposal.id is null then
    raise exception 'WMS_NOT_FOUND';
  end if;

  -- 2. State validation
  if v_proposal.status = 'EXECUTED' then
    raise exception 'WMS_ALREADY_EXECUTED';
  end if;

  if v_proposal.status <> 'APPROVED' then
    raise exception 'WMS_INVALID_STATE';
  end if;

  -- 3. Lock source quant and reservation
  select * into v_quant
    from public.inventory_quants
   where tenant_id = p_tenant
     and id = v_proposal.source_quant_id
     for update;

  if not found then
    raise exception 'WMS_STOCK_NOT_LOCATED';
  end if;

  select * into v_res
    from public.stock_reservations
   where tenant_id = p_tenant
     and reference_id = v_proposal.id
     and reference_type = 'REPLENISHMENT_PROPOSAL'
     and status = 'HELD'
     for update;

  if not found then
    raise exception 'WMS_RESERVATION_MISSING';
  end if;

  -- 4. Merma / Unavailability check in origin (Scenario E2-146 / MUST-1)
  if v_quant.stock_status <> 'AVAILABLE'
     or coalesce((p_payload->>'report_depleted')::boolean, false) = true
     or coalesce((p_payload->>'merma')::boolean, false) = true then

    update public.wms_proposals
       set status = 'CANCELLED',
           rejection_reason = 'WMS_SOURCE_STOCK_DEPLETED',
           updated_at = now()
     where id = v_proposal.id;

    if v_proposal.task_id is not null then
      update public.warehouse_tasks
         set state = 'CANCELLED',
             completed_at = now()
       where id = v_proposal.task_id;
    end if;

    update public.stock_reservations
       set status = 'CANCELLED',
           released_at = now()
     where id = v_res.id;

    update public.inventory_quants
       set quantity_reserved = greatest(0, quantity_reserved - v_res.quantity),
           stock_status = case when stock_status = 'AVAILABLE' then 'INSPECTION' else stock_status end,
           updated_at = now()
     where id = v_quant.id;

    insert into public.audit_events (
      tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data
    ) values (
      p_tenant, 'WMS_PROPOSAL', v_proposal.id, 'REPLENISH_DEPLETED', p_actor, 'FORNEXA_WMS',
      to_jsonb(v_proposal),
      jsonb_build_object('status', 'CANCELLED', 'error', 'WMS_SOURCE_STOCK_DEPLETED')
    );

    return jsonb_build_object(
      'ok', false,
      'error', 'WMS_SOURCE_STOCK_DEPLETED',
      'proposal_status', 'CANCELLED'
    );
  end if;

  -- 5. Physical Movement in inventory_movements
  insert into public.inventory_movements (
    tenant_id, warehouse_id, movement_type, source_bin_id, destination_bin_id,
    product_id, batch_number, quantity, uom, operator_id, status, notes, handling_unit_id
  ) values (
    p_tenant, v_proposal.warehouse_id, 'REPLENISHMENT', v_proposal.source_bin_id, v_proposal.destination_bin_id,
    v_proposal.product_id, v_proposal.batch_number, v_proposal.suggested_quantity, v_proposal.uom,
    p_actor::text, 'COMPLETED', 'Replenishment proposal ' || v_proposal.id::text, v_proposal.source_hu_id
  );

  -- 6. Update quants and preserve immutable received_at (MUST-1)
  -- Deduct source
  update public.inventory_quants
     set quantity_on_hand = quantity_on_hand - v_proposal.suggested_quantity,
         quantity_reserved = greatest(0, quantity_reserved - v_proposal.suggested_quantity),
         updated_at = now()
   where id = v_quant.id;

  -- Destination quant: update or insert
  select * into v_dest_quant
    from public.inventory_quants
   where tenant_id = p_tenant
     and bin_id = v_proposal.destination_bin_id
     and product_id = v_proposal.product_id
     and (v_proposal.batch_number is null or batch_number = v_proposal.batch_number)
     and stock_status = 'AVAILABLE'
   for update;

  if found then
    update public.inventory_quants
       set quantity_on_hand = quantity_on_hand + v_proposal.suggested_quantity,
           received_at = least(received_at, v_quant.received_at),
           updated_at = now()
     where id = v_dest_quant.id;
  else
    insert into public.inventory_quants (
      tenant_id, warehouse_id, bin_id, product_id, batch_number,
      quantity_on_hand, quantity_reserved, uom, flow_state, stock_status,
      received_at, hu_id
    ) values (
      p_tenant, v_proposal.warehouse_id, v_proposal.destination_bin_id, v_proposal.product_id, v_proposal.batch_number,
      v_proposal.suggested_quantity, 0, v_proposal.uom, 'STORED', 'AVAILABLE',
      v_quant.received_at, v_proposal.target_hu_id
    );
  end if;

  -- 7. Close reservation and task
  update public.stock_reservations
     set status = 'RELEASED',
         released_at = now()
   where id = v_res.id;

  if v_proposal.task_id is not null then
    update public.warehouse_tasks
       set state = 'DONE',
           completed_at = now()
     where id = v_proposal.task_id;
  end if;

  -- 8. Atomic proposal transition & idempotency persistence
  v_result := jsonb_build_object(
    'ok', true,
    'action', 'REPLENISH',
    'proposal_id', v_proposal.id,
    'task_id', v_proposal.task_id,
    'status', 'EXECUTED'
  );

  update public.wms_proposals
     set status = 'EXECUTED',
         executed_by = p_actor,
         idempotency_key = p_idempotency_key,
         idempotency_fingerprint = v_fingerprint,
         execution_result = v_result,
         updated_at = now()
   where id = v_proposal.id;

  -- 9. Audit event
  insert into public.audit_events (
    tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data
  ) values (
    p_tenant, 'WMS_PROPOSAL', v_proposal.id, 'REPLENISH', p_actor, 'FORNEXA_WMS',
    to_jsonb(v_proposal),
    to_jsonb(v_result)
  );

  return v_result;
end;
$$;

revoke all on function public.fornexa_wms_replenish(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.fornexa_wms_replenish(uuid, uuid, uuid, text, jsonb) to service_role;

-- ── 6. Extension of fornexa_wms_action Dispatcher ───────────────────────────
-- Dispatch replenishment actions directly to their dedicated functions
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

  -- ── E2 ACTIONS DISPATCH ───────────────────────────────────────────────────
  if p_action = 'EVALUATE_REPLENISHMENT' then
    v_warehouse_id := (p_payload->>'warehouse_id')::uuid;
    return public.fornexa_wms_evaluate_replenishment(
      p_tenant,
      p_actor,
      v_warehouse_id,
      nullif(p_payload->>'rule_id', '')::uuid,
      nullif(p_payload->>'order_id', '')::uuid
    );

  elsif p_action = 'APPROVE_PROPOSAL' then
    return public.fornexa_wms_approve_proposal(
      p_tenant,
      p_actor,
      (p_payload->>'proposal_id')::uuid
    );

  elsif p_action = 'REJECT_PROPOSAL' then
    return public.fornexa_wms_reject_proposal(
      p_tenant,
      p_actor,
      (p_payload->>'proposal_id')::uuid,
      p_payload->>'reason'
    );

  elsif p_action = 'CANCEL_PROPOSAL' then
    return public.fornexa_wms_cancel_proposal(
      p_tenant,
      p_actor,
      (p_payload->>'proposal_id')::uuid,
      p_payload->>'reason'
    );

  elsif p_action = 'REPLENISH' and (p_payload ? 'proposal_id') then
    return public.fornexa_wms_replenish(
      p_tenant,
      p_actor,
      (p_payload->>'proposal_id')::uuid,
      v_idem,
      p_payload
    );
  end if;

  -- 3) Idempotency check across warehouse_tasks for classic actions
  v_fingerprint := coalesce(p_action, '') || ':' ||
                   coalesce(p_payload->>'hu_id', '') || ':' ||
                   coalesce(p_payload->>'quant_id', '') || ':' ||
                   coalesce(p_payload->>'reservation_id', '') || ':' ||
                   coalesce(p_payload->>'destination_bin_id', '') || ':' ||
                   coalesce(p_payload->>'quantity', '') || ':' ||
                   coalesce(upper(trim(p_payload->>'status')), '') || ':' ||
                   coalesce(p_payload->>'reject_code', '') || ':' ||
                   coalesce(p_payload->>'reason', '') || ':' ||
                   coalesce(upper(trim(p_payload->>'disposition')), '') || ':' ||
                   coalesce(p_payload->>'order_id', '') || ':' ||
                   coalesce(p_payload->>'task_id', '') || ':' ||
                   coalesce(p_payload->>'warehouse_id', '') || ':' ||
                   coalesce(p_payload->>'product_id', '') || ':' ||
                   coalesce(p_payload->>'measured_weight_kg', '') || ':' ||
                   coalesce(p_payload->>'measured_volume_m3', '') || ':' ||
                   coalesce(p_payload->>'scanned_code', '');

  if v_idem is not null then
    select * into v_existing_task
      from public.warehouse_tasks
     where tenant_id = p_tenant
       and idempotency_key = v_idem
       for update;

    if found then
      if v_existing_task.idempotency_fingerprint = v_fingerprint then
        return jsonb_build_object(
          'ok', true,
          'idempotent_replay', true,
          'task_id', v_existing_task.id,
          'task_type', v_existing_task.task_type,
          'state', v_existing_task.state,
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
    v_policy := public.fornexa_wms_effective_policy(p_tenant, v_hu.warehouse_id, null, v_product_id);

    if (p_payload->>'status') is distinct from null and upper(trim(p_payload->>'status')) = 'REJECTED' then
      v_disposition := upper(trim(coalesce(p_payload->>'disposition', 'QUARANTINE')));
      if v_disposition not in ('QUARANTINE', 'DAMAGED') then
        raise exception 'WMS_FORBIDDEN';
      end if;
      v_rej_state := v_disposition;

      update public.handling_units
         set state = v_rej_state,
             updated_at = v_ts
       where tenant_id = p_tenant and id = v_hu.id;

      update public.inventory_quants
         set flow_state = v_rej_state,
             stock_status = v_rej_state,
             updated_at = v_ts
       where tenant_id = p_tenant and hu_id = v_hu.id;

      insert into public.warehouse_tasks (
        tenant_id, warehouse_id, task_type, state, priority,
        hu_id, failure_reason, idempotency_key, idempotency_fingerprint,
        created_by, completed_at
      ) values (
        p_tenant, v_hu.warehouse_id, 'CHECK', 'FAILED', 1,
        v_hu.id, coalesce(p_payload->>'reason', p_payload->>'reject_code', 'REJECTED_ON_CHECK'),
        v_idem, v_fingerprint, p_actor, v_ts
      ) returning id into v_task_id;

      insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
      values (p_tenant, 'HANDLING_UNIT', v_hu.id, 'RECEIVE_CHECK_REJECT', p_actor, 'FORNEXA_WMS', to_jsonb(v_hu), jsonb_build_object('state', v_rej_state));

      return jsonb_build_object('ok', true, 'action', 'RECEIVE_CHECK', 'status', 'REJECTED', 'hu_id', v_hu.id, 'task_id', v_task_id, 'state', v_rej_state);
    end if;

    if coalesce((v_policy->>'capture_lot_on_receipt')::boolean, true) then
      v_batch := coalesce(
        nullif(trim(coalesce(p_payload->>'batch_number', '')), ''),
        (select huc.batch_number from public.handling_unit_contents huc where huc.tenant_id = p_tenant and huc.handling_unit_id = v_hu.id limit 1)
      );
      if v_batch is null then
        raise exception 'WMS_LOT_REQUIRED';
      end if;
    end if;

    if coalesce((v_policy->>'capture_expiry_on_receipt')::boolean, true) then
      v_expiry := coalesce(
        nullif(p_payload->>'expiry_date', '')::date,
        (select huc.expiry_date from public.handling_unit_contents huc where huc.tenant_id = p_tenant and huc.handling_unit_id = v_hu.id limit 1)
      );
      if v_expiry is null then
        raise exception 'WMS_EXPIRY_REQUIRED';
      end if;
    end if;

    update public.handling_units
       set state = 'STAGING_CHECKED',
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_hu.id;

    update public.inventory_quants
       set flow_state = 'STAGING_CHECKED',
           updated_at = v_ts
     where tenant_id = p_tenant and hu_id = v_hu.id;

    insert into public.warehouse_tasks (
      tenant_id, warehouse_id, task_type, state, priority,
      hu_id, idempotency_key, idempotency_fingerprint,
      created_by, completed_at
    ) values (
      p_tenant, v_hu.warehouse_id, 'CHECK', 'DONE', 1,
      v_hu.id, v_idem, v_fingerprint, p_actor, v_ts
    ) returning id into v_task_id;

    insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
    values (p_tenant, 'HANDLING_UNIT', v_hu.id, 'RECEIVE_CHECK_PASS', p_actor, 'FORNEXA_WMS', to_jsonb(v_hu), jsonb_build_object('state', 'STAGING_CHECKED'));

    return jsonb_build_object('ok', true, 'action', 'RECEIVE_CHECK', 'status', 'PASSED', 'hu_id', v_hu.id, 'task_id', v_task_id, 'state', 'STAGING_CHECKED');

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

    if v_hu.state <> 'STAGING_CHECKED' then
      raise exception 'WMS_HU_NOT_CHECKED';
    end if;

    select * into v_bin
      from public.warehouse_bins wb
     where wb.tenant_id = p_tenant and wb.id = v_bin_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    if v_bin.warehouse_id <> v_hu.warehouse_id then
      raise exception 'WMS_CROSS_WAREHOUSE_INVALID';
    end if;

    if not v_bin.is_active or v_bin.is_blocked then
      raise exception 'WMS_BIN_BLOCKED';
    end if;

    select * into v_zone
      from public.warehouse_zones wz
     where wz.tenant_id = p_tenant and wz.id = v_bin.zone_id;

    select count(distinct iq.hu_id),
           coalesce(sum(iq.quantity_on_hand * coalesce(p.gross_weight_kg, 0)), 0),
           coalesce(sum(iq.quantity_on_hand * coalesce(p.volume_m3, 0)), 0)
      into v_current_pallets, v_current_weight, v_current_volume
      from public.inventory_quants iq
      join public.products p on p.tenant_id = iq.tenant_id and p.id = iq.product_id
     where iq.tenant_id = p_tenant and iq.bin_id = v_bin.id and iq.quantity_on_hand > 0;

    if v_bin.max_pallets is not null and (v_current_pallets + 1) > v_bin.max_pallets then
      raise exception 'WMS_BIN_CAPACITY';
    end if;
    if v_bin.max_weight_kg is not null and (v_current_weight + coalesce(v_hu.gross_weight_kg, 0)) > v_bin.max_weight_kg then
      raise exception 'WMS_BIN_CAPACITY';
    end if;
    if v_bin.max_volume_m3 is not null and (v_current_volume + coalesce(v_hu.volume_m3, 0)) > v_bin.max_volume_m3 then
      raise exception 'WMS_BIN_CAPACITY';
    end if;

    update public.handling_units
       set state = 'STORED',
           bin_id = v_bin.id,
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_hu.id;

    update public.inventory_quants
       set flow_state = 'STORED',
           bin_id = v_bin.id,
           updated_at = v_ts
     where tenant_id = p_tenant and hu_id = v_hu.id;

    insert into public.warehouse_tasks (
      tenant_id, warehouse_id, task_type, state, priority,
      hu_id, destination_bin_id, idempotency_key, idempotency_fingerprint,
      created_by, completed_at
    ) values (
      p_tenant, v_hu.warehouse_id, 'PUTAWAY', 'DONE', 2,
      v_hu.id, v_bin.id, v_idem, v_fingerprint, p_actor, v_ts
    ) returning id into v_task_id;

    insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
    values (p_tenant, 'HANDLING_UNIT', v_hu.id, 'PUTAWAY', p_actor, 'FORNEXA_WMS', to_jsonb(v_hu), jsonb_build_object('state', 'STORED', 'bin_id', v_bin.id));

    return jsonb_build_object('ok', true, 'action', 'PUTAWAY', 'hu_id', v_hu.id, 'destination_bin_id', v_bin.id, 'task_id', v_task_id, 'state', 'STORED');

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

    if v_quant.flow_state is null or v_quant.flow_state in ('STAGING_UNCHECKED', 'STAGING_CHECKED') then
      raise exception 'WMS_STOCK_NOT_LOCATED';
    end if;
    if v_quant.stock_status <> 'AVAILABLE' then
      raise exception 'WMS_STOCK_BLOCKED';
    end if;

    v_free := v_quant.quantity_on_hand - v_quant.quantity_reserved;
    if v_free < v_qty then
      raise exception 'WMS_INSUFFICIENT_STOCK';
    end if;

    update public.inventory_quants
       set quantity_reserved = quantity_reserved + v_qty,
           flow_state = case when flow_state = 'STORED' then 'RESERVED' else flow_state end,
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_quant.id;

    insert into public.stock_reservations (
      tenant_id, warehouse_id, order_id, product_id, batch_number, quant_id, quantity, uom,
      status, reference_type, created_by
    ) values (
      p_tenant, v_quant.warehouse_id, (p_payload->>'order_id')::uuid, v_quant.product_id, v_quant.batch_number,
      v_quant.id, v_qty, v_quant.uom, 'ALLOCATED', 'ORDER', p_actor
    ) returning id into v_res_id;

    return jsonb_build_object('ok', true, 'action', 'RESERVE', 'reservation_id', v_res_id, 'quant_id', v_quant.id, 'quantity_reserved', v_qty);

  -- ── ACTION: PICK ───────────────────────────────────────────────────────────
  elsif p_action = 'PICK' then
    v_res_id := (p_payload->>'reservation_id')::uuid;
    select * into v_res
      from public.stock_reservations sr
     where sr.tenant_id = p_tenant and sr.id = v_res_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    if v_res.status <> 'ALLOCATED' then
      raise exception 'WMS_NOT_RESERVED';
    end if;

    select * into v_quant
      from public.inventory_quants iq
     where iq.tenant_id = p_tenant and iq.id = v_res.quant_id
       for update;

    update public.stock_reservations
       set status = 'PICKED',
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_res.id;

    update public.inventory_quants
       set quantity_on_hand = quantity_on_hand - v_res.quantity,
           quantity_reserved = greatest(0, quantity_reserved - v_res.quantity),
           flow_state = 'PICKED_STAGED',
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_quant.id;

    return jsonb_build_object('ok', true, 'action', 'PICK', 'reservation_id', v_res.id, 'quantity_picked', v_res.quantity);

  -- ── ACTION: CONTROL_STATE (C3) ─────────────────────────────────────────────
  elsif p_action = 'CONTROL_STATE' then
    v_hu_id := (p_payload->>'hu_id')::uuid;
    select * into v_hu
      from public.handling_units hu
     where hu.tenant_id = p_tenant and hu.id = v_hu_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    if v_hu.state = 'LOADED' then
      raise exception 'WMS_FORBIDDEN';
    end if;

    v_control_status := upper(trim(coalesce(p_payload->>'status', 'PASSED')));
    if v_control_status = 'PASSED' then
      update public.handling_units
         set state_controlled_at = v_ts,
             state_controlled_by = p_actor,
             updated_at = v_ts
       where tenant_id = p_tenant and id = v_hu.id;
      return jsonb_build_object('ok', true, 'action', 'CONTROL_STATE', 'status', 'PASSED', 'hu_id', v_hu.id);
    else
      update public.handling_units
         set state = 'QUARANTINE',
             state_controlled_at = null,
             updated_at = v_ts
       where tenant_id = p_tenant and id = v_hu.id;
      return jsonb_build_object('ok', true, 'action', 'CONTROL_STATE', 'status', 'REJECTED', 'hu_id', v_hu.id, 'state', 'QUARANTINE');
    end if;

  -- ── ACTION: LABEL (C3) ─────────────────────────────────────────────────────
  elsif p_action = 'LABEL' then
    v_hu_id := (p_payload->>'hu_id')::uuid;
    select * into v_hu
      from public.handling_units hu
     where hu.tenant_id = p_tenant and hu.id = v_hu_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    select coalesce(sum(huc.quantity * coalesce(p.gross_weight_kg, 0)), 0),
           coalesce(sum(huc.quantity * coalesce(p.volume_m3, 0)), 0)
      into v_computed_weight, v_computed_volume
      from public.handling_unit_contents huc
      join public.products p on p.tenant_id = huc.tenant_id and p.id = huc.product_id
     where huc.tenant_id = p_tenant and huc.handling_unit_id = v_hu.id;

    update public.handling_units
       set gross_weight_kg = coalesce(nullif(v_hu.gross_weight_kg, 0), v_computed_weight),
           volume_m3 = coalesce(nullif(v_hu.volume_m3, 0), v_computed_volume),
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_hu.id;

    return jsonb_build_object('ok', true, 'action', 'LABEL', 'hu_id', v_hu.id);

  -- ── ACTION: LOAD (C3) ──────────────────────────────────────────────────────
  elsif p_action = 'LOAD' then
    v_hu_id := (p_payload->>'hu_id')::uuid;
    select * into v_hu
      from public.handling_units hu
     where hu.tenant_id = p_tenant and hu.id = v_hu_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    v_policy := public.fornexa_wms_effective_policy(p_tenant, v_hu.warehouse_id, null, null);
    if coalesce((v_policy->>'require_state_control_on_load')::boolean, true) and v_hu.state_controlled_at is null then
      raise exception 'WMS_CONTROL_PENDING';
    end if;

    update public.handling_units
       set state = 'LOADED',
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_hu.id;

    return jsonb_build_object('ok', true, 'action', 'LOAD', 'hu_id', v_hu.id, 'state', 'LOADED');

  -- ── ACTION: UPSERT_POLICY ──────────────────────────────────────────────────
  elsif p_action = 'UPSERT_POLICY' then
    if v_role not in ('OWNER','ADMIN','PLANNER') then
      raise exception 'WMS_FORBIDDEN';
    end if;
    v_warehouse_id := (p_payload->>'warehouse_id')::uuid;
    if v_warehouse_id is null or not exists (select 1 from public.warehouses where tenant_id = p_tenant and id = v_warehouse_id) then
      raise exception 'WMS_FORBIDDEN';
    end if;

    insert into public.warehouse_behavior_policies (tenant_id, warehouse_id, policy)
    values (p_tenant, v_warehouse_id, p_payload->'policy')
    on conflict (tenant_id, warehouse_id, coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set policy = excluded.policy, updated_at = v_ts
    returning to_jsonb(warehouse_behavior_policies.*) into v_after;

    return jsonb_build_object('ok', true, 'action', 'UPSERT_POLICY', 'policy', v_after);

  -- ── ACTION: UPSERT_RESOURCE ────────────────────────────────────────────────
  elsif p_action = 'UPSERT_RESOURCE' then
    if v_role not in ('OWNER','ADMIN','PLANNER') then
      raise exception 'WMS_FORBIDDEN';
    end if;
    v_warehouse_id := (p_payload->>'warehouse_id')::uuid;
    if v_warehouse_id is null or not exists (select 1 from public.warehouses where tenant_id = p_tenant and id = v_warehouse_id) then
      raise exception 'WMS_FORBIDDEN';
    end if;

    insert into public.warehouse_resources (
      tenant_id, warehouse_id, code, name, resource_type, status,
      max_lift_height_m, max_weight_kg, certifications, shift_code, is_active
    ) values (
      p_tenant, v_warehouse_id, p_payload->>'code', p_payload->>'name', p_payload->>'resource_type',
      coalesce(p_payload->>'status', 'AVAILABLE'),
      nullif(p_payload->>'max_lift_height_m', '')::numeric(5,2),
      nullif(p_payload->>'max_weight_kg', '')::numeric(10,2),
      coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'certifications', '[]'::jsonb))), '{}'),
      nullif(p_payload->>'shift_code', ''),
      case when lower(trim(coalesce(p_payload->>'is_active', ''))) in ('false', '0', 'no', 'off') then false else true end
    )
    on conflict (tenant_id, warehouse_id, code) do update set
      name = excluded.name,
      resource_type = excluded.resource_type,
      status = excluded.status,
      max_lift_height_m = excluded.max_lift_height_m,
      max_weight_kg = excluded.max_weight_kg,
      certifications = excluded.certifications,
      shift_code = excluded.shift_code,
      is_active = excluded.is_active,
      updated_at = v_ts
    returning * into v_resource;

    return jsonb_build_object('ok', true, 'action', 'UPSERT_RESOURCE', 'resource', to_jsonb(v_resource));

  else
    raise exception 'WMS_FORBIDDEN';
  end if;
end;
$$;

revoke all on function public.fornexa_wms_action(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.fornexa_wms_action(uuid, uuid, text, jsonb, text) to service_role;

commit;
