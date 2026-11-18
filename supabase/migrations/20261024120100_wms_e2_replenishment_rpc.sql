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
  p_product_id uuid default null,
  p_dest_bin_id uuid default null,
  p_order_id uuid default null,
  p_requested_qty numeric default null
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

  -- Iterate over candidate rules with FOR UPDATE concurrency protection
  for v_r in
    select *
      from public.replenishment_rules
     where tenant_id = p_tenant
       and warehouse_id = p_warehouse_id
       and active = true
       and (p_rule_id is null or id = p_rule_id)
       and (p_product_id is null or product_id = p_product_id)
       and (p_dest_bin_id is null or destination_bin_id = p_dest_bin_id)
     order by created_at asc
     for update
  loop
    -- MUST-SQL-3 Convergence check: skip if active proposal already exists for this rule or order
    if exists (
      select 1
        from public.wms_proposals wp
       where wp.tenant_id = p_tenant
         and wp.warehouse_id = v_r.warehouse_id
         and wp.product_id = v_r.product_id
         and wp.destination_bin_id = v_r.destination_bin_id
         and wp.status in ('DRAFT', 'APPROVED')
         and (
           (p_order_id is null and wp.order_id is null and wp.rule_id = v_r.id)
           or (p_order_id is not null and wp.order_id = p_order_id)
         )
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
       and iq.stock_status in ('AVAILABLE','RESERVED')
       and (iq.flow_state is null or iq.flow_state in ('STORED','RESERVED'));

    -- Calculate destination in-transit stock
    select coalesce(sum(wp.suggested_quantity), 0)
      into v_stock_en_transito
      from public.wms_proposals wp
     where wp.tenant_id = p_tenant
       and wp.destination_bin_id = v_r.destination_bin_id
       and wp.product_id = v_r.product_id
       and wp.status in ('DRAFT', 'APPROVED');

    v_stock_destino := v_stock_fisico_libre + v_stock_en_transito;

    -- Determine suggested quantity: order-demand driven or min/max triggered
    if p_order_id is not null and p_requested_qty is not null and p_requested_qty > 0 then
      v_suggested_qty := p_requested_qty;
    else
      if v_stock_destino <= v_r.min_quantity then
        v_deficit := v_r.max_quantity - v_stock_destino;
        v_multiplo_inferior := floor(v_deficit / v_r.reorder_quantity) * v_r.reorder_quantity;
        if v_multiplo_inferior > 0 then
          v_suggested_qty := v_multiplo_inferior;
        else
          v_suggested_qty := least(v_r.reorder_quantity, v_deficit);
        end if;
      else
        v_suggested_qty := 0;
      end if;
    end if;

    if v_suggested_qty <= 0 then
      continue;
    end if;

    -- Effective warehouse policy
    v_policy := public.fornexa_wms_effective_policy(p_tenant, v_r.warehouse_id, null, v_r.product_id);
    v_rotation := coalesce(v_policy->>'rotation', 'FEFO');
    v_consolidation := coalesce(v_r.consolidation, v_policy->>'consolidation', 'YES');

    -- Check destination bin with FOR UPDATE concurrency lock
    select * into v_dest_bin
      from public.warehouse_bins
     where tenant_id = p_tenant
       and id = v_r.destination_bin_id
       and is_active = true
       and is_blocked = false
     for update;

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

    -- Select candidate source quant according to rotation policy (MUST-SQL-3 & SHOULD-SQL-1)
    select iq.* into v_candidate_quant
      from public.inventory_quants iq
      join public.warehouse_bins wb on wb.tenant_id = iq.tenant_id and wb.id = iq.bin_id
     where iq.tenant_id = p_tenant
       and iq.warehouse_id = v_r.warehouse_id
       and iq.product_id = v_r.product_id
       and iq.stock_status = 'AVAILABLE'
       and (iq.flow_state is null or iq.flow_state in ('STORED', 'RESERVED'))
       and (iq.quantity_on_hand - iq.quantity_reserved) >= v_suggested_qty
       and iq.bin_id <> v_r.destination_bin_id
       and wb.is_active = true
       and wb.is_blocked = false
     order by
       case when v_rotation = 'FIFO' then iq.received_at end asc nulls first,
       case when v_rotation = 'FEFO' then iq.expiry_date end asc nulls last,
       case when v_rotation = 'FEFO' then iq.received_at end asc nulls first,
       case when v_rotation = 'LIFO' then iq.received_at end desc nulls last,
       case when v_rotation = 'LIFO' then iq.id end desc,
       iq.created_at asc,
       iq.id asc
     limit 1;

    if v_candidate_quant.id is null then
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

    -- Determine target_hu_id and incoming pallet delta (MUST-SQL-2: valid FK or null)
    if v_candidate_quant.hu_id is not null and v_candidate_quant.quantity_on_hand = v_suggested_qty then
      v_target_hu_id := v_candidate_quant.hu_id;
      v_incoming_pallets_delta := case when v_candidate_quant.bin_id <> v_r.destination_bin_id then 1 else 0 end;
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
      else
        v_target_hu_id := null;
        v_incoming_pallets_delta := 0;
      end if;
    end if;

    -- Physical Bin Capacity check (MUST-SQL-2 & N1)
    select * into v_prod
      from public.products
     where tenant_id = p_tenant and id = v_r.product_id;

    -- 1. Weight check
    if v_dest_bin.max_weight_kg is not null then
      if v_candidate_quant.hu_id is not null and v_candidate_quant.quantity_on_hand = v_suggested_qty then
        select gross_weight_kg into v_incoming_weight
          from public.handling_units
         where tenant_id = p_tenant and id = v_candidate_quant.hu_id;
      else
        v_incoming_weight := null;
      end if;

      if v_incoming_weight is null then
        if v_prod.gross_weight_kg is not null then
          v_incoming_weight := v_suggested_qty * v_prod.gross_weight_kg;
        else
          v_status := 'REJECTED';
          v_rejection_reason := 'WMS_BIN_CAPACITY';
        end if;
      end if;

      if v_status <> 'REJECTED' then
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

        if (v_cur_weight + v_transit_weight + v_incoming_weight) > v_dest_bin.max_weight_kg then
          v_status := 'REJECTED';
          v_rejection_reason := 'WMS_BIN_CAPACITY';
        end if;
      end if;
    end if;

    -- 2. Volume check
    if v_dest_bin.max_volume_m3 is not null then
      if v_candidate_quant.hu_id is not null and v_candidate_quant.quantity_on_hand = v_suggested_qty then
        select volume_m3 into v_incoming_vol
          from public.handling_units
         where tenant_id = p_tenant and id = v_candidate_quant.hu_id;
      else
        v_incoming_vol := null;
      end if;

      if v_incoming_vol is null then
        if v_prod.volume_m3 is not null then
          v_incoming_vol := v_suggested_qty * v_prod.volume_m3;
        else
          v_status := 'REJECTED';
          v_rejection_reason := 'WMS_BIN_CAPACITY';
        end if;
      end if;

      if v_status <> 'REJECTED' then
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

        if (v_cur_vol + v_transit_vol + v_incoming_vol) > v_dest_bin.max_volume_m3 then
          v_status := 'REJECTED';
          v_rejection_reason := 'WMS_BIN_CAPACITY';
        end if;
      end if;
    end if;

    -- 3. Pallet check
    if v_dest_bin.max_pallets > 0 then
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
      tenant_id, warehouse_id, rule_id, order_id, product_id,
      batch_number, source_bin_id, source_hu_id, source_quant_id,
      destination_bin_id, target_hu_id, suggested_quantity, uom,
      status, rejection_reason, created_by
    ) values (
      p_tenant, v_r.warehouse_id, v_r.id, p_order_id, v_r.product_id,
      v_candidate_quant.batch_number, v_candidate_quant.bin_id, v_candidate_quant.hu_id, v_candidate_quant.id,
      v_r.destination_bin_id, v_target_hu_id, v_suggested_qty, v_candidate_quant.uom,
      v_status, v_rejection_reason, p_actor
    ) returning * into v_proposal;

    -- Audit event
    insert into public.audit_events (
      tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data
    ) values (
      p_tenant, 'WMS_PROPOSAL', v_proposal.id, 'CREATE_PROPOSAL', p_actor, 'FORNEXA_WMS',
      null, to_jsonb(v_proposal)
    );

    v_proposals := v_proposals || jsonb_build_array(to_jsonb(v_proposal));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'proposals', v_proposals,
    'count', jsonb_array_length(v_proposals)
  );
end;
$$;

revoke all on function public.fornexa_wms_evaluate_replenishment(uuid, uuid, uuid, uuid, uuid, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.fornexa_wms_evaluate_replenishment(uuid, uuid, uuid, uuid, uuid, uuid, uuid, numeric) to service_role;

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

  if not found or v_quant.stock_status not in ('AVAILABLE', 'RESERVED')
     or (v_quant.flow_state is not null and v_quant.flow_state not in ('STORED', 'RESERVED')) then
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

  -- Create HELD reservation (MUST-SQL-1: strictly real columns)
  insert into public.stock_reservations (
    tenant_id, quant_id, hu_id, order_id, batch_number, serial_number, quantity, uom,
    status, reference_type, reference_id, created_by
  ) values (
    p_tenant, v_proposal.source_quant_id, v_proposal.source_hu_id, v_proposal.order_id,
    v_proposal.batch_number, v_quant.serial_number, v_proposal.suggested_quantity, v_proposal.uom,
    'HELD', 'REPLENISHMENT_PROPOSAL', v_proposal.id, p_actor
  ) returning * into v_res;

  -- Create warehouse task (MUST-SQL-1: strictly real columns)
  insert into public.warehouse_tasks (
    tenant_id, warehouse_id, task_type, state, priority,
    source_bin_id, destination_bin_id, hu_id, product_id,
    quantity, uom, proposal_id
  ) values (
    p_tenant, v_proposal.warehouse_id, 'REPLENISH', 'READY', 10,
    v_proposal.source_bin_id, v_proposal.destination_bin_id,
    coalesce(v_proposal.target_hu_id, v_proposal.source_hu_id),
    v_proposal.product_id, v_proposal.suggested_quantity, v_proposal.uom,
    v_proposal.id
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

  -- If was APPROVED, release reservation, restore quant flow_state and cancel task
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
             flow_state = case when greatest(0, quantity_reserved - v_res.quantity) = 0 and flow_state = 'RESERVED' then 'STORED' else flow_state end,
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
  v_failure_code text;
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
  if v_quant.stock_status not in ('AVAILABLE', 'RESERVED')
     or (v_quant.flow_state is not null and v_quant.flow_state not in ('STORED', 'RESERVED'))
     or coalesce((p_payload->>'report_depleted')::boolean, false) = true
     or coalesce((p_payload->>'merma')::boolean, false) = true then

    v_failure_code := case
      when coalesce((p_payload->>'report_depleted')::boolean, false)
        or coalesce((p_payload->>'merma')::boolean, false) then 'WMS_SOURCE_STOCK_DEPLETED'
      else 'WMS_SOURCE_STOCK_UNAVAILABLE' end;

    update public.wms_proposals
       set status = 'CANCELLED',
           rejection_reason = v_failure_code,
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
           -- Quarantine is a workflow hold, not a merge into another quant's
           -- INSPECTION key. Preserve quant ID, HU, stock_status and other orders.
           flow_state = 'QUARANTINE',
           updated_at = now()
     where id = v_quant.id;

    insert into public.audit_events (
      tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data
    ) values (
      p_tenant, 'WMS_PROPOSAL', v_proposal.id, 'REPLENISH_DEPLETED', p_actor, 'FORNEXA_WMS',
      to_jsonb(v_proposal),
      jsonb_build_object('status', 'CANCELLED', 'error', v_failure_code,
        'source_quant_id', v_quant.id, 'reconciliation_required', true,
        'source_quant_previous_flow_state', v_quant.flow_state,
        'source_quant_previous_stock_status', v_quant.stock_status,
        'reconciliation_scope', 'SOURCE_QUANT_ALL_RESERVATIONS')
    );

    return jsonb_build_object(
      'ok', false,
      'error', v_failure_code,
      'proposal_status', 'CANCELLED'
    );
  end if;

  -- Match evaluator lock order: destination before any destination quant.
  -- Same-bin executions cannot race SELECT-not-found / INSERT.
  perform 1 from public.warehouse_bins
    where tenant_id = p_tenant and id = v_proposal.destination_bin_id for update;

  -- 5. Physical Movement in inventory_movements (MUST-SQL-1: real columns)
  insert into public.inventory_movements (
    tenant_id, warehouse_id, movement_type, source_bin_id, destination_bin_id,
    product_id, owner_party_id, batch_number, serial_number, reference_order_id,
    quantity, uom, operator_id, started_at, completed_at, status, notes
  ) values (
    p_tenant, v_proposal.warehouse_id, 'REPLENISHMENT', v_proposal.source_bin_id, v_proposal.destination_bin_id,
    v_proposal.product_id, v_quant.owner_party_id, v_proposal.batch_number, v_quant.serial_number, v_proposal.order_id,
    v_proposal.suggested_quantity, v_proposal.uom, p_actor::text, now(), now(), 'COMPLETED',
    case when v_proposal.source_hu_id is not null then 'HU: ' || v_proposal.source_hu_id::text else 'Replenishment proposal ' || v_proposal.id::text end
  );

  -- 6. Update quants and preserve immutable received_at (MUST-1 & MUST-SQL-2)
  -- Deduct source
  update public.inventory_quants
     set quantity_on_hand = quantity_on_hand - v_proposal.suggested_quantity,
         quantity_reserved = greatest(0, quantity_reserved - v_proposal.suggested_quantity),
         flow_state = case when greatest(0, quantity_reserved - v_proposal.suggested_quantity) = 0 and flow_state = 'RESERVED' then 'STORED' else flow_state end,
         updated_at = now()
   where id = v_quant.id;

  -- Destination quant: update or insert
  select * into v_dest_quant
    from public.inventory_quants
   where tenant_id = p_tenant
     and bin_id = v_proposal.destination_bin_id
     and product_id = v_proposal.product_id
     and batch_number is not distinct from v_proposal.batch_number
     and owner_party_id is not distinct from v_quant.owner_party_id
     and serial_number is not distinct from v_quant.serial_number
     and hu_id is not distinct from v_proposal.target_hu_id
     and stock_status = 'AVAILABLE'
   for update;

  if found then
    update public.inventory_quants
       set quantity_on_hand = quantity_on_hand + v_proposal.suggested_quantity,
           expiry_date = case when expiry_date is null then v_quant.expiry_date
                              when v_quant.expiry_date is null then expiry_date
                              else least(expiry_date, v_quant.expiry_date) end,
           received_at = least(received_at, v_quant.received_at),
           flow_state = 'STORED',
           updated_at = now()
     where id = v_dest_quant.id;
  else
    insert into public.inventory_quants (
      tenant_id, warehouse_id, bin_id, product_id, owner_party_id,
      batch_number, serial_number, expiry_date,
      quantity_on_hand, quantity_reserved, uom, flow_state, stock_status,
      received_at, hu_id
    ) values (
      p_tenant, v_proposal.warehouse_id, v_proposal.destination_bin_id, v_proposal.product_id, v_quant.owner_party_id,
      v_proposal.batch_number, v_quant.serial_number, v_quant.expiry_date,
      v_proposal.suggested_quantity, 0, v_proposal.uom, 'STORED', 'AVAILABLE',
      v_quant.received_at, v_proposal.target_hu_id
    );
  end if;

  -- Full HU update if applicable (MUST-SQL-2)
  if v_proposal.source_hu_id is not null and v_proposal.target_hu_id is not null and v_proposal.source_hu_id = v_proposal.target_hu_id then
    update public.handling_units
       set current_bin_id = v_proposal.destination_bin_id,
           state = 'STORED',
           updated_at = now()
     where tenant_id = p_tenant and id = v_proposal.source_hu_id;
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
-- Restores complete production body of fornexa_wms_action (incorporating all C-3 and E1 controls)
-- and injects deterministic dispatch for E2 Replenishment RPCs immediately following role validation.
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

  -- E2 Replenishment RPC Dispatch Block
  if p_action = 'EVALUATE_REPLENISHMENT' then
    return public.fornexa_wms_evaluate_replenishment(
      p_tenant,
      p_actor,
      (p_payload->>'warehouse_id')::uuid,
      nullif(p_payload->>'rule_id', '')::uuid,
      nullif(p_payload->>'product_id', '')::uuid,
      nullif(p_payload->>'destination_bin_id', '')::uuid,
      nullif(p_payload->>'order_id', '')::uuid,
      nullif(p_payload->>'requested_quantity', '')::numeric(12,3)
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
  elsif p_action = 'REPLENISH' and (p_payload ? 'proposal_id') and nullif(p_payload->>'proposal_id', '') is not null then
    return public.fornexa_wms_replenish(
      p_tenant,
      p_actor,
      (p_payload->>'proposal_id')::uuid,
      v_idem,
      p_payload
    );
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
      from public.warehouse_tasks wt
     where wt.tenant_id = p_tenant
       and wt.idempotency_key = v_idem
       for update;

    if found then
      if (v_existing_task.state in ('DONE', 'FAILED') or
          (p_action = 'REPLENISH' and v_existing_task.task_type = 'REPLENISH'
           and v_existing_task.state in ('PROPOSED','READY','ASSIGNED','IN_PROGRESS')))
         and v_existing_task.reject_detail = v_fingerprint then
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

      -- MUST-4 & MUST-C: Release reserved quantity from exact source quant upon confirming REPLENISH
      if v_task.task_type = 'REPLENISH' then
        if v_task.source_quant_id is not null then
          update public.inventory_quants
             set quantity_reserved = greatest(0, quantity_reserved - v_task.quantity),
                 updated_at = v_ts
           where id = v_task.source_quant_id and tenant_id = p_tenant;
        elsif v_task.source_bin_id is not null then
          -- Fallback for legacy tasks prior to source_quant_id
          update public.inventory_quants
             set quantity_reserved = greatest(0, quantity_reserved - v_task.quantity),
                 updated_at = v_ts
           where id = (
             select id from public.inventory_quants
              where tenant_id = p_tenant
                and warehouse_id = v_task.warehouse_id
                and bin_id = v_task.source_bin_id
                and product_id = v_task.product_id
                and (v_task.hu_id is null or hu_id = v_task.hu_id)
                and quantity_reserved > 0
              order by quantity_reserved desc, updated_at desc
              limit 1
           );
        end if;
      end if;

      insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
      values (p_tenant, 'WAREHOUSE_TASK', v_task.id, p_action, p_actor, 'FORNEXA_WMS', v_before, to_jsonb(v_task));
      return jsonb_build_object('ok', true, 'action', p_action, 'task', to_jsonb(v_task));
    end if;

    v_warehouse_id := (p_payload->>'warehouse_id')::uuid;
    v_product_id := (p_payload->>'product_id')::uuid;
    v_bin_id := (p_payload->>'destination_bin_id')::uuid;
    v_qty := coalesce(nullif(p_payload->>'quantity', '')::numeric(12,3), 1);
    if v_qty <= 0 then raise exception 'WMS_FORBIDDEN'; end if;

    -- MUST-5: Lock and validate destination bin to serialize concurrent replenishment planning
    select * into v_bin
      from public.warehouse_bins wb
     where wb.tenant_id = p_tenant
       and wb.warehouse_id = v_warehouse_id
       and wb.id = v_bin_id
       for update;
    if not found then
      raise exception 'WMS_FORBIDDEN';
    end if;

    -- Distinct preparation orders may replenish the same destination concurrently.
    -- The destination row lock serializes the policy check, not the lifetime of tasks.
    -- MUST-5: Lock quants in destination bin to serialize consolidation evaluation
    perform 1
       from public.inventory_quants iq
      where iq.tenant_id = p_tenant
        and iq.bin_id = v_bin_id
        for update;

    v_policy := public.fornexa_wms_effective_policy(p_tenant, v_warehouse_id, null, v_product_id);

    -- C-3 Policy derivation: consolidation behavior is derived strictly from server policy
    v_consolidation := coalesce(v_policy->>'consolidation', 'YES');

    -- MUST-C: Lock candidate source quants to serialize concurrent replenishment planning across sessions/destinations
    perform 1
       from public.inventory_quants iq
      where iq.tenant_id = p_tenant
        and iq.warehouse_id = v_warehouse_id
        and iq.product_id = v_product_id
        and iq.flow_state in ('STORED', 'RESERVED')
        and iq.stock_status in ('AVAILABLE', 'RESERVED')
      order by iq.expiry_date asc nulls last, iq.created_at asc
        for update;

    -- MUST-3 & MUST-C: Evaluate available balance directly against durable reservation:
    -- (iq.quantity_on_hand - iq.quantity_reserved) >= v_qty without mixing total reservations with task subsets.
    select * into v_quant
      from public.inventory_quants iq
     where iq.tenant_id = p_tenant
       and iq.warehouse_id = v_warehouse_id
       and iq.product_id = v_product_id
       and iq.flow_state in ('STORED', 'RESERVED')
       and iq.stock_status in ('AVAILABLE', 'RESERVED')
       and iq.bin_id <> v_bin_id
       and (nullif(p_payload->>'quant_id', '') is null or iq.id = (p_payload->>'quant_id')::uuid)
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

    -- Pending tasks are incoming stock for consolidation policy, but never imply
    -- blanket destination exclusivity. Compatible orders may share the same bin.
    if v_consolidation = 'BY_BATCH' and exists (
      select 1 from public.warehouse_tasks wt
      join public.inventory_quants sq on sq.tenant_id = wt.tenant_id and sq.id = wt.source_quant_id
       where wt.tenant_id = p_tenant and wt.destination_bin_id = v_bin_id
         and wt.task_type = 'REPLENISH' and wt.state in ('PROPOSED','READY','ASSIGNED','IN_PROGRESS')
         and wt.product_id = v_product_id and sq.batch_number is distinct from v_quant.batch_number
    ) then
      raise exception 'WMS_CONSOLIDATION_CONFLICT';
    elsif v_consolidation = 'NO' and exists (
      select 1 from public.warehouse_tasks wt
       where wt.tenant_id = p_tenant and wt.destination_bin_id = v_bin_id
         and wt.task_type = 'REPLENISH' and wt.state in ('PROPOSED','READY','ASSIGNED','IN_PROGRESS')
    ) then
      raise exception 'WMS_CONSOLIDATION_CONFLICT';
    end if;

    -- MUST-C: Persist stock reservation directly on the source quant to prevent double consumption across sessions
    update public.inventory_quants
       set quantity_reserved = quantity_reserved + v_qty,
           updated_at = v_ts
     where tenant_id = p_tenant and id = v_quant.id
     returning * into v_quant;

    -- MUST-1 & MUST-4: Persist source_quant_id for exact release and v_fingerprint in reject_detail for idempotent replay
    insert into public.warehouse_tasks (
      tenant_id, warehouse_id, task_type, state, source_bin_id, destination_bin_id,
      hu_id, product_id, quantity, uom, idempotency_key, reject_detail, source_quant_id, order_id
    ) values (
      p_tenant, v_warehouse_id, 'REPLENISH', 'READY', v_quant.bin_id, v_bin_id,
      v_quant.hu_id, v_product_id, v_qty, v_quant.uom, v_idem, v_fingerprint, v_quant.id, nullif(p_payload->>'order_id', '')::uuid
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

    -- MUST-4: Capture true pre-image before state mutation for exhaustive audit tracking
    v_before := to_jsonb(v_hu);

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

      -- MUST-1: reject_detail stores v_fingerprint for server-enforced idempotent replay verification
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

      -- MUST-1: reject_detail stores v_fingerprint for server-enforced idempotent replay verification
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

    -- MUST-2: Current partida/SGA values take precedence; contents/products are only an estimate when no declaration exists.
    v_expected_weight := coalesce(nullif(v_hu.gross_weight_kg, 0), nullif(v_computed_weight, 0));
    v_expected_volume := coalesce(nullif(v_hu.volume_m3, 0), nullif(v_computed_volume, 0));

    v_measured_weight := nullif(p_payload->>'measured_weight_kg', '')::numeric(10,3);
    v_measured_volume := nullif(p_payload->>'measured_volume_m3', '')::numeric(10,4);
    v_weight_tol := coalesce((v_policy->>'weight_tolerance_pct')::numeric(6,2), 5.0);
    v_vol_tol := coalesce((v_policy->>'volume_tolerance_pct')::numeric(6,2), 10.0);

    -- SHOULD-5: Asimetría deliberada de defaults: require_state_control_on_load es true por defecto (fail-closed de control físico),
    -- mientras que require_weight_measurement y require_volume_measurement son false por defecto (opt-in de pesaje/cubicaje).
    v_req_weight := public.fornexa_wms_policy_bool(v_policy, 'require_weight_measurement', false);
    v_req_vol := public.fornexa_wms_policy_bool(v_policy, 'require_volume_measurement', false);

    -- Fran: the current SGA declaration suffices, even when these flags are true.
    -- Only an explicitly supplied measurement is compared and stamped as measured.
    if v_req_weight and v_measured_weight is null
       and coalesce(nullif(v_hu.gross_weight_kg, 0), v_expected_weight, 0) <= 0 then
      raise exception 'WMS_WEIGHT_TOLERANCE';
    end if;
    if v_measured_weight is not null then
      if v_measured_weight <= 0 then raise exception 'WMS_WEIGHT_TOLERANCE'; end if;
      if v_expected_weight > 0 and
         abs(v_measured_weight - v_expected_weight) / v_expected_weight * 100.0 > v_weight_tol then
        raise exception 'WMS_WEIGHT_TOLERANCE';
      end if;
    end if;
    if v_req_vol and v_measured_volume is null
       and coalesce(nullif(v_hu.volume_m3, 0), v_expected_volume, 0) <= 0 then
      raise exception 'WMS_VOLUME_TOLERANCE';
    end if;
    if v_measured_volume is not null then
      if v_measured_volume <= 0 then raise exception 'WMS_VOLUME_TOLERANCE'; end if;
      if v_expected_volume > 0 and
         abs(v_measured_volume - v_expected_volume) / v_expected_volume * 100.0 > v_vol_tol then
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
    values (p_tenant, 'HANDLING_UNIT', v_hu.id, 'LABEL', p_actor, 'FORNEXA_WMS', v_before,
      to_jsonb(v_hu) || jsonb_build_object(
        'weight_source', case when v_measured_weight is not null then 'OPERATOR_INPUT' when (v_before->>'gross_weight_kg')::numeric > 0 then 'SGA_DECLARED' else 'CONTENTS_ESTIMATE' end,
        'volume_source', case when v_measured_volume is not null then 'OPERATOR_INPUT' when (v_before->>'volume_m3')::numeric > 0 then 'SGA_DECLARED' else 'CONTENTS_ESTIMATE' end));

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

    -- MUST-2: Current partida/SGA values take precedence; contents/products are only an estimate when no declaration exists.
    v_expected_weight := coalesce(nullif(v_hu.gross_weight_kg, 0), nullif(v_computed_weight, 0));
    v_expected_volume := coalesce(nullif(v_hu.volume_m3, 0), nullif(v_computed_volume, 0));

    v_measured_weight := nullif(p_payload->>'measured_weight_kg', '')::numeric(10,3);
    v_measured_volume := nullif(p_payload->>'measured_volume_m3', '')::numeric(10,4);
    v_weight_tol := coalesce((v_policy->>'weight_tolerance_pct')::numeric(6,2), 5.0);
    v_vol_tol := coalesce((v_policy->>'volume_tolerance_pct')::numeric(6,2), 10.0);

    -- SHOULD-5: Asimetría deliberada de defaults: require_state_control_on_load es true por defecto (fail-closed de control físico),
    -- mientras que require_weight_measurement y require_volume_measurement son false por defecto (opt-in de pesaje/cubicaje).
    v_req_weight := public.fornexa_wms_policy_bool(v_policy, 'require_weight_measurement', false);
    v_req_vol := public.fornexa_wms_policy_bool(v_policy, 'require_volume_measurement', false);

    -- Fran: the current SGA declaration suffices, even when these flags are true.
    -- Only an explicitly supplied measurement is compared and stamped as measured.
    if v_req_weight and v_measured_weight is null
       and coalesce(nullif(v_hu.gross_weight_kg, 0), v_expected_weight, 0) <= 0 then
      raise exception 'WMS_WEIGHT_TOLERANCE';
    end if;
    if v_measured_weight is not null then
      if v_measured_weight <= 0 then raise exception 'WMS_WEIGHT_TOLERANCE'; end if;
      if v_expected_weight > 0 and
         abs(v_measured_weight - v_expected_weight) / v_expected_weight * 100.0 > v_weight_tol then
        raise exception 'WMS_WEIGHT_TOLERANCE';
      end if;
    end if;
    if v_req_vol and v_measured_volume is null
       and coalesce(nullif(v_hu.volume_m3, 0), v_expected_volume, 0) <= 0 then
      raise exception 'WMS_VOLUME_TOLERANCE';
    end if;
    if v_measured_volume is not null then
      if v_measured_volume <= 0 then raise exception 'WMS_VOLUME_TOLERANCE'; end if;
      if v_expected_volume > 0 and
         abs(v_measured_volume - v_expected_volume) / v_expected_volume * 100.0 > v_vol_tol then
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
    values (p_tenant, 'HANDLING_UNIT', v_hu.id, 'LOAD', p_actor, 'FORNEXA_WMS', v_before,
      to_jsonb(v_hu) || jsonb_build_object(
        'weight_source', case when v_measured_weight is not null then 'OPERATOR_INPUT' when (v_before->>'gross_weight_kg')::numeric > 0 then 'SGA_DECLARED' else 'CONTENTS_ESTIMATE' end,
        'volume_source', case when v_measured_volume is not null then 'OPERATOR_INPUT' when (v_before->>'volume_m3')::numeric > 0 then 'SGA_DECLARED' else 'CONTENTS_ESTIMATE' end));

    return jsonb_build_object('ok', true, 'action', 'LOAD', 'hu', to_jsonb(v_hu), 'task_id', v_task.id);

  -- ── ACTION: UPSERT_POLICY (versioned replacement) ──────────────────────────
  elsif p_action = 'UPSERT_POLICY' then
    if v_role not in ('OWNER','ADMIN','PLANNER') then
      raise exception 'WMS_FORBIDDEN';
    end if;
    v_warehouse_id := (p_payload->>'warehouse_id')::uuid;
    -- MUST-D: Validate warehouse belongs to p_tenant to prevent cross-tenant referencing
    if v_warehouse_id is null or not exists (
      select 1 from public.warehouses where tenant_id = p_tenant and id = v_warehouse_id
    ) then
      raise exception 'WMS_FORBIDDEN';
    end if;
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

  -- ── ACTION: UPSERT_RESOURCE (Preservada de E1 sin bypass) ──────────────────
  elsif p_action = 'UPSERT_RESOURCE' then
    if v_role not in ('OWNER','ADMIN','PLANNER') then
      raise exception 'WMS_FORBIDDEN';
    end if;
    v_warehouse_id := (p_payload->>'warehouse_id')::uuid;
    -- MUST-D: Validate warehouse belongs to p_tenant to prevent cross-tenant referencing
    if v_warehouse_id is null or not exists (
      select 1 from public.warehouses where tenant_id = p_tenant and id = v_warehouse_id
    ) then
      raise exception 'WMS_FORBIDDEN';
    end if;
    insert into public.warehouse_resources (
      tenant_id, warehouse_id, code, name, resource_type, status,
      max_lift_height_m, max_weight_kg, certifications, shift_code, is_active
    ) values (
      p_tenant,
      v_warehouse_id,
      p_payload->>'code',
      p_payload->>'name',
      p_payload->>'resource_type',
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

    insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
    values (p_tenant, 'WAREHOUSE_RESOURCE', v_resource.id, 'UPSERT_RESOURCE', p_actor, 'FORNEXA_WMS', null, to_jsonb(v_resource));

    return jsonb_build_object('ok', true, 'action', 'UPSERT_RESOURCE', 'resource', to_jsonb(v_resource));

  else
    raise exception 'WMS_FORBIDDEN';
  end if;
end;
$$;

revoke all on function public.fornexa_wms_action(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.fornexa_wms_action(uuid, uuid, text, jsonb, text) to service_role;

commit;
