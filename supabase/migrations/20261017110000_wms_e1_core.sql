-- WMS-E1: Core Operational Warehouse Management Schema, Policies, Resources, HUs, Reservations, Tasks & Atomic RPC
-- TASK_ID: WMS-RESEARCH-20261017 · Fase 3 (Entrega E1 — Núcleo operable)
-- Production application remains gated by exact-HEAD review and BEGIN ... ROLLBACK rehearsal.

begin;

-- ── 0. Parent composite (tenant_id, id) unique indexes for tenant-safe composite FKs ──
create unique index if not exists warehouses_tenant_id_id_key       on public.warehouses(tenant_id, id);
create unique index if not exists warehouse_zones_tenant_id_id_key  on public.warehouse_zones(tenant_id, id);
create unique index if not exists warehouse_bins_tenant_id_id_key   on public.warehouse_bins(tenant_id, id);
create unique index if not exists products_tenant_id_id_key         on public.products(tenant_id, id);
create unique index if not exists parties_tenant_id_id_key          on public.parties(tenant_id, id);
create unique index if not exists orders_tenant_id_id_key           on public.orders(tenant_id, id);
create unique index if not exists order_lines_tenant_id_id_key      on public.order_lines(tenant_id, id);
create unique index if not exists inventory_quants_tenant_id_id_key on public.inventory_quants(tenant_id, id);
create unique index if not exists warehouse_docks_tenant_id_id_key  on public.warehouse_docks(tenant_id, id);

-- ── 1. Flow state & HU linkage on inventory_quants (legacy NULL = fail-closed) ──
alter table public.inventory_quants
  add column if not exists flow_state text
    check (flow_state is null or flow_state in (
      'STAGING_UNCHECKED','STAGING_CHECKED','STORED','RESERVED',
      'PICKED_STAGED','LOADED','QUARANTINE','DAMAGED'
    )),
  add column if not exists hu_id uuid;

-- ── 2. Resource linkage on inventory_movements (preserves legacy operator_id text) ──
alter table public.inventory_movements
  add column if not exists resource_id uuid;

-- ── 3. Warehouse behavior policies (hierarchical, versioned) ──
create table if not exists public.warehouse_behavior_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  warehouse_id uuid not null,
  owner_party_id uuid,
  scope text not null check (scope in ('WAREHOUSE','OWNER','CATEGORY','PRODUCT')),
  product_id uuid,
  category_code text,
  policy_version integer not null default 1 check (policy_version > 0),
  effective_from timestamptz not null default now(),
  superseded_at timestamptz,
  params jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wbp_scope_target check (
    (scope = 'WAREHOUSE' and product_id is null and owner_party_id is null and category_code is null) or
    (scope = 'OWNER'     and product_id is null and owner_party_id is not null and category_code is null) or
    (scope = 'CATEGORY'  and product_id is null and category_code is not null) or
    (scope = 'PRODUCT'   and product_id is not null)
  ),
  constraint wbp_tenant_id_key unique (tenant_id, id),
  foreign key (tenant_id, warehouse_id)   references public.warehouses(tenant_id, id) on delete cascade,
  foreign key (tenant_id, owner_party_id) references public.parties(tenant_id, id)    on delete cascade,
  foreign key (tenant_id, product_id)     references public.products(tenant_id, id)   on delete cascade
);

create unique index if not exists wbp_active_scope_idx
  on public.warehouse_behavior_policies (
    tenant_id,
    warehouse_id,
    scope,
    coalesce(owner_party_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(category_code, '')
  )
  where superseded_at is null;

-- ── 4. Warehouse resources (operators, forklifts, reach trucks, AGVs, AS/RS) ──
create table if not exists public.warehouse_resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  warehouse_id uuid not null,
  code text not null,
  name text not null,
  resource_type text not null check (resource_type in (
    'OPERATOR','FORKLIFT','REACH_TRUCK','ORDER_PICKER','PALLET_TRUCK','ASRS_CRANE','AGV','CONVEYOR'
  )),
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','BUSY','OFFLINE','MAINTENANCE')),
  max_lift_height_m numeric(5,2) check (max_lift_height_m is null or max_lift_height_m > 0),
  max_weight_kg numeric(10,2) check (max_weight_kg is null or max_weight_kg > 0),
  certifications text[] not null default '{}',
  shift_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_resources_code_key unique (tenant_id, warehouse_id, code),
  constraint warehouse_resources_tenant_id_key unique (tenant_id, id),
  foreign key (tenant_id, warehouse_id) references public.warehouses(tenant_id, id) on delete cascade
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_movements_resource_fk'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_resource_fk
      foreign key (tenant_id, resource_id) references public.warehouse_resources(tenant_id, id) on delete set null (resource_id);
  end if;
end $$;

-- ── 5. Handling units (LPN / SSCC-18) and contents ──
create table if not exists public.handling_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  warehouse_id uuid not null,
  code text not null,
  code_type text not null default 'LPN' check (code_type in ('LPN','SSCC')),
  hu_type text not null check (hu_type in ('PALLET','BOX','TOTE','CONTAINER')),
  state text not null default 'STAGING_UNCHECKED' check (state in (
    'STAGING_UNCHECKED','STAGING_CHECKED','STORED','PICKED_STAGED','LOADED','QUARANTINE','DAMAGED'
  )),
  current_bin_id uuid,
  current_dock_id uuid,
  owner_party_id uuid,
  parent_hu_id uuid,
  gross_weight_kg numeric(10,3) check (gross_weight_kg is null or gross_weight_kg >= 0),
  volume_m3 numeric(10,4) check (volume_m3 is null or volume_m3 >= 0),
  label_issued_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint handling_units_code_key unique (tenant_id, code),
  constraint handling_units_tenant_id_key unique (tenant_id, id),
  constraint hu_stored_needs_bin check (state <> 'STORED' or current_bin_id is not null),
  foreign key (tenant_id, warehouse_id)    references public.warehouses(tenant_id, id)      on delete cascade,
  foreign key (tenant_id, current_bin_id)  references public.warehouse_bins(tenant_id, id)  on delete set null (current_bin_id),
  foreign key (tenant_id, current_dock_id) references public.warehouse_docks(tenant_id, id) on delete set null (current_dock_id),
  foreign key (tenant_id, owner_party_id)  references public.parties(tenant_id, id)         on delete set null (owner_party_id),
  foreign key (tenant_id, parent_hu_id)    references public.handling_units(tenant_id, id)  on delete set null (parent_hu_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_quants_hu_fk'
  ) then
    alter table public.inventory_quants
      add constraint inventory_quants_hu_fk
      foreign key (tenant_id, hu_id) references public.handling_units(tenant_id, id) on delete set null (hu_id);
  end if;
end $$;

create table if not exists public.handling_unit_contents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  handling_unit_id uuid not null,
  product_id uuid not null,
  batch_number text,
  serial_number text,
  expiry_date date,
  quantity numeric(12,3) not null check (quantity > 0),
  uom text not null default 'UN',
  created_at timestamptz not null default now(),
  foreign key (tenant_id, handling_unit_id) references public.handling_units(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id)       references public.products(tenant_id, id)       on delete restrict
);

create index if not exists handling_unit_contents_hu_idx on public.handling_unit_contents(handling_unit_id);

-- ── 6. Line-level stock reservations (with batch_number for WMS_LOT_MISMATCH) ──
create table if not exists public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  quant_id uuid not null,
  hu_id uuid,
  order_id uuid,
  order_line_id uuid,
  trip_id uuid,
  batch_number text,
  serial_number text,
  quantity numeric(12,3) not null check (quantity > 0),
  uom text not null default 'UN',
  status text not null default 'HELD' check (status in ('HELD','ALLOCATED','PICKED','RELEASED','CANCELLED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  foreign key (tenant_id, quant_id)      references public.inventory_quants(tenant_id, id) on delete cascade,
  foreign key (tenant_id, hu_id)         references public.handling_units(tenant_id, id)   on delete set null (hu_id),
  foreign key (tenant_id, order_id)      references public.orders(tenant_id, id)           on delete cascade,
  foreign key (tenant_id, order_line_id) references public.order_lines(tenant_id, id)      on delete cascade
);

create index if not exists stock_reservations_quant_idx on public.stock_reservations(quant_id, status);
create index if not exists stock_reservations_order_idx on public.stock_reservations(order_id, status);

-- ── 7. Warehouse operational tasks ──
create table if not exists public.warehouse_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  warehouse_id uuid not null,
  task_type text not null check (task_type in (
    'RECEIVE_CHECK','PUTAWAY','REPLENISH','PICK','PACK','LABEL','LOAD','COUNT','TRANSFER'
  )),
  priority integer not null default 100,
  state text not null default 'PROPOSED' check (state in (
    'PROPOSED','READY','ASSIGNED','IN_PROGRESS','DONE','REJECTED','CANCELLED'
  )),
  assigned_resource_id uuid,
  source_bin_id uuid,
  destination_bin_id uuid,
  hu_id uuid,
  product_id uuid,
  quantity numeric(12,3) check (quantity is null or quantity > 0),
  uom text,
  idempotency_key text,
  reject_code text,
  reject_detail text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint warehouse_tasks_idem_key unique (tenant_id, idempotency_key),
  constraint warehouse_tasks_tenant_id_key unique (tenant_id, id),
  foreign key (tenant_id, warehouse_id)         references public.warehouses(tenant_id, id)          on delete cascade,
  foreign key (tenant_id, assigned_resource_id) references public.warehouse_resources(tenant_id, id) on delete set null (assigned_resource_id),
  foreign key (tenant_id, source_bin_id)        references public.warehouse_bins(tenant_id, id)      on delete set null (source_bin_id),
  foreign key (tenant_id, destination_bin_id)   references public.warehouse_bins(tenant_id, id)      on delete set null (destination_bin_id),
  foreign key (tenant_id, hu_id)                references public.handling_units(tenant_id, id)      on delete set null (hu_id),
  foreign key (tenant_id, product_id)           references public.products(tenant_id, id)            on delete restrict
);

create index if not exists warehouse_tasks_queue_idx    on public.warehouse_tasks(warehouse_id, state, priority, created_at);
create index if not exists warehouse_tasks_resource_idx on public.warehouse_tasks(assigned_resource_id, state);

-- ── 8. Updated_at triggers for E1 tables with updated_at ──
do $$
declare t text;
begin
  foreach t in array array['warehouse_behavior_policies','warehouse_resources','handling_units'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.fornexa_set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- ── 9. Security (MUST-D1 + C3 residual): Read via RLS, Write EXCLUSIVELY via RPC ──
-- Covers the 6 new E1 tables AND closes the permissive FOR ALL policies on inventory_quants
-- and inventory_movements inherited from 20261002233000_master_data_foundation.sql.
do $$
declare t text;
begin
  foreach t in array array[
    'warehouse_behavior_policies',
    'warehouse_resources',
    'handling_units',
    'handling_unit_contents',
    'stock_reservations',
    'warehouse_tasks',
    'inventory_quants',
    'inventory_movements'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format('drop policy if exists tenant_read on public.%I', t);
    execute format(
      'create policy tenant_read on public.%I for select to authenticated using (public.fornexa_has_tenant_access(tenant_id))',
      t
    );
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- ── 10. Effective policy resolution: WAREHOUSE -> OWNER -> CATEGORY -> PRODUCT ──
create or replace function public.fornexa_wms_effective_policy(
  p_tenant uuid,
  p_warehouse uuid,
  p_owner uuid default null,
  p_product uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_effective jsonb := jsonb_build_object(
    'capture_lot_on_receipt', true,
    'capture_expiry_on_receipt', true,
    'require_qa_check', false,
    'allowed_bin_types', jsonb_build_array('PALLET_RACK','SHELVING','BULK_FLOOR','CANTILEVER','DOCK_STAGE','CROSS_DOCK','DYNAMIC_FLOW'),
    'putaway_strategy', 'FEFO',
    'allow_mixed_lots_in_bin', false,
    'allow_mixed_skus_in_bin', false,
    'max_pallets_per_bin', 2,
    'capture_lot_on_pick', true,
    'rotation', 'FEFO',
    'min_remaining_shelf_life_days', 15,
    'forbid_picking_unlocated', true,
    'partial_pick_allowed', true,
    'replenishment_trigger', 'MIN_MAX',
    'min_qty', 10,
    'max_qty', 50,
    'consolidation', 'YES',
    'top_off_threshold', 0.3,
    'require_label_scan_on_load', true,
    'weight_tolerance_pct', 5.0,
    'volume_tolerance_pct', 10.0,
    'require_state_control_on_load', true,
    'allow_cross_dock', false,
    'require_resource_certification', true,
    'max_lift_height_m', 12.0,
    'max_weight_kg', 1500.0
  );
  v_owner uuid := p_owner;
  v_category text := null;
  v_row record;
begin
  if p_product is not null then
    select coalesce(v_owner, pr.owner_party_id), pr.category_code
      into v_owner, v_category
      from public.products pr
     where pr.tenant_id = p_tenant and pr.id = p_product;
  end if;

  for v_row in
    select wbp.scope, wbp.params
      from public.warehouse_behavior_policies wbp
     where wbp.tenant_id = p_tenant
       and wbp.warehouse_id = p_warehouse
       and wbp.superseded_at is null
       and wbp.effective_from <= clock_timestamp()
       and (
         wbp.scope = 'WAREHOUSE'
         or (wbp.scope = 'OWNER' and v_owner is not null and wbp.owner_party_id = v_owner)
         or (wbp.scope = 'CATEGORY' and v_category is not null and wbp.category_code = v_category and (wbp.owner_party_id is null or wbp.owner_party_id = v_owner))
         or (wbp.scope = 'PRODUCT' and p_product is not null and wbp.product_id = p_product and (wbp.owner_party_id is null or wbp.owner_party_id = v_owner))
       )
     order by
       case wbp.scope
         when 'WAREHOUSE' then 1
         when 'OWNER'     then 2
         when 'CATEGORY'  then 3
         when 'PRODUCT'   then 4
         else 5
       end asc,
       wbp.policy_version asc
  loop
    v_effective := v_effective || coalesce(v_row.params, '{}'::jsonb);
  end loop;

  -- Golden Rule invariant: forbid_picking_unlocated is unconditionally true
  v_effective := v_effective || '{"forbid_picking_unlocated": true}'::jsonb;
  return v_effective;
end $$;

-- SECURITY DEFINER no pasa por RLS: concederla a `authenticated` sin comprobar la
-- pertenencia a p_tenant permitía leer la política efectiva de otro tenant. Su único
-- consumidor legítimo es fornexa_wms_action (SECURITY DEFINER, puede invocarla sin grant)
-- y el ensayo, que se conecta como servicio. Se cierra sin impacto funcional.
revoke all on function public.fornexa_wms_effective_policy(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fornexa_wms_effective_policy(uuid, uuid, uuid, uuid) to service_role;

-- ── 11. Exclusive atomic mutation RPC: fornexa_wms_action ──
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
  v_idem text := nullif(trim(coalesce(p_idempotency_key, p_payload->>'idempotency_key', '')), '');
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
  v_weight_tol numeric(6,2);
  v_vol_tol numeric(6,2);
  v_scanned_code text;
  v_scanned_batch text;
  v_consolidation text;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_ts timestamptz := date_trunc('milliseconds', clock_timestamp());
begin
  -- 1) Explicit tenant mismatch check if payload declares tenant_id
  if p_payload is not null and (p_payload ? 'tenant_id') and nullif(p_payload->>'tenant_id', '') is not null then
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
  v_fingerprint := coalesce(p_action, '') || ':' || coalesce(p_payload->>'hu_id', '') || ':' ||
                   coalesce(p_payload->>'quant_id', '') || ':' || coalesce(p_payload->>'reservation_id', '') || ':' ||
                   coalesce(p_payload->>'destination_bin_id', '') || ':' || coalesce(p_payload->>'quantity', '');

  if v_idem is not null then
    select * into v_existing_task
      from public.warehouse_tasks wt
     where wt.tenant_id = p_tenant
       and wt.idempotency_key = v_idem
       for update;

    if found then
      if v_existing_task.state = 'DONE' and coalesce(v_existing_task.reject_detail, v_fingerprint) = v_fingerprint then
        return jsonb_build_object(
          'ok', true,
          'idempotent_replay', true,
          'action', p_action,
          'task_id', v_existing_task.id,
          'hu_id', v_existing_task.hu_id,
          'destination_bin_id', v_existing_task.destination_bin_id
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

    if (coalesce((v_policy->>'capture_lot_on_receipt')::boolean, true) or v_product.is_batch_managed) and v_batch is null then
      raise exception 'WMS_LOT_REQUIRED';
    end if;

    if (coalesce((v_policy->>'capture_expiry_on_receipt')::boolean, true) or v_product.shelf_life_days is not null) and v_expiry is null then
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

    -- Sync linked staging quant if present or create staging quant if current_bin_id is set
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
      if coalesce((v_policy->>'require_resource_certification')::boolean, true) and v_product.is_hazardous
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

    if v_product.is_hazardous and coalesce(p_payload->>'adr_Incompatible', 'false') = 'true' then
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
    if not coalesce((v_policy->>'allow_mixed_lots_in_bin')::boolean, false) then
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

    -- Golden Rule & MUST-D3: flow_state IS NULL or not STORED/RESERVED -> WMS_STOCK_NOT_LOCATED
    if v_quant.flow_state is null or v_quant.flow_state not in ('STORED', 'RESERVED') then
      raise exception 'WMS_STOCK_NOT_LOCATED';
    end if;

    if v_quant.stock_status not in ('AVAILABLE', 'RESERVED') then
      raise exception 'WMS_STOCK_BLOCKED';
    end if;

    -- Check pending replenishment on this bin
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
    if coalesce((v_policy->>'capture_lot_on_pick')::boolean, true) and v_res.batch_number is not null then
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
    v_consolidation := coalesce(p_payload->>'consolidation', v_policy->>'consolidation', 'YES');

    if v_consolidation = 'BY_BATCH' and (p_payload ? 'conflicting_batch') and (p_payload->>'conflicting_batch') is distinct from (p_payload->>'batch_number') then
      raise exception 'WMS_CONSOLIDATION_CONFLICT';
    end if;

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

    if v_hu.state <> 'PICKED_STAGED' then
      raise exception 'WMS_NOT_READY_TO_LOAD';
    end if;

    v_policy := public.fornexa_wms_effective_policy(p_tenant, v_hu.warehouse_id, v_hu.owner_party_id, null);

    if coalesce((v_policy->>'require_state_control_on_load')::boolean, true)
       and (p_payload ? 'state_controlled') and (p_payload->>'state_controlled')::boolean = false then
      raise exception 'WMS_CONTROL_PENDING';
    end if;

    v_measured_weight := nullif(p_payload->>'measured_weight_kg', '')::numeric(10,3);
    v_expected_weight := coalesce(nullif(p_payload->>'expected_weight_kg', '')::numeric(10,3), v_hu.gross_weight_kg);
    v_weight_tol := coalesce((v_policy->>'weight_tolerance_pct')::numeric(6,2), 5.0);

    if v_measured_weight is not null and v_expected_weight is not null and v_expected_weight > 0 then
      if abs(v_measured_weight - v_expected_weight) / v_expected_weight * 100.0 > v_weight_tol then
        raise exception 'WMS_WEIGHT_TOLERANCE';
      end if;
    end if;

    v_measured_volume := nullif(p_payload->>'measured_volume_m3', '')::numeric(10,4);
    v_expected_volume := coalesce(nullif(p_payload->>'expected_volume_m3', '')::numeric(10,4), v_hu.volume_m3);
    v_vol_tol := coalesce((v_policy->>'volume_tolerance_pct')::numeric(6,2), 10.0);

    if v_measured_volume is not null and v_expected_volume is not null and v_expected_volume > 0 then
      if abs(v_measured_volume - v_expected_volume) / v_expected_volume * 100.0 > v_vol_tol then
        raise exception 'WMS_VOLUME_TOLERANCE';
      end if;
    end if;

    v_before := to_jsonb(v_hu);

    update public.handling_units
       set label_issued_at = v_ts,
           gross_weight_kg = coalesce(v_measured_weight, gross_weight_kg),
           volume_m3 = coalesce(v_measured_volume, volume_m3),
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

    if v_hu.state <> 'PICKED_STAGED' then
      raise exception 'WMS_NOT_READY_TO_LOAD';
    end if;

    if v_hu.label_issued_at is null then
      raise exception 'WMS_LABEL_MISSING';
    end if;

    v_policy := public.fornexa_wms_effective_policy(p_tenant, v_hu.warehouse_id, v_hu.owner_party_id, null);

    v_scanned_code := nullif(trim(coalesce(p_payload->>'scanned_code', p_payload->>'label_code', '')), '');
    if coalesce((v_policy->>'require_label_scan_on_load')::boolean, true) then
      if v_scanned_code is null or v_scanned_code <> v_hu.code then
        raise exception 'WMS_LABEL_MISMATCH';
      end if;
    end if;

    if coalesce((v_policy->>'require_state_control_on_load')::boolean, true)
       and (p_payload ? 'state_controlled') and (p_payload->>'state_controlled')::boolean = false then
      raise exception 'WMS_CONTROL_PENDING';
    end if;

    v_measured_weight := nullif(p_payload->>'measured_weight_kg', '')::numeric(10,3);
    v_expected_weight := coalesce(nullif(p_payload->>'expected_weight_kg', '')::numeric(10,3), v_hu.gross_weight_kg);
    v_weight_tol := coalesce((v_policy->>'weight_tolerance_pct')::numeric(6,2), 5.0);

    if v_measured_weight is not null and v_expected_weight is not null and v_expected_weight > 0 then
      if abs(v_measured_weight - v_expected_weight) / v_expected_weight * 100.0 > v_weight_tol then
        raise exception 'WMS_WEIGHT_TOLERANCE';
      end if;
    end if;

    v_measured_volume := nullif(p_payload->>'measured_volume_m3', '')::numeric(10,4);
    v_expected_volume := coalesce(nullif(p_payload->>'expected_volume_m3', '')::numeric(10,4), v_hu.volume_m3);
    v_vol_tol := coalesce((v_policy->>'volume_tolerance_pct')::numeric(6,2), 10.0);

    if v_measured_volume is not null and v_expected_volume is not null and v_expected_volume > 0 then
      if abs(v_measured_volume - v_expected_volume) / v_expected_volume * 100.0 > v_vol_tol then
        raise exception 'WMS_VOLUME_TOLERANCE';
      end if;
    end if;

    v_before := to_jsonb(v_hu);

    update public.handling_units
       set state = 'LOADED',
           current_bin_id = null,
           current_dock_id = coalesce(nullif(p_payload->>'dock_id', '')::uuid, current_dock_id),
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
      policy_version, effective_from, params, created_by
    ) values (
      p_tenant,
      v_warehouse_id,
      nullif(p_payload->>'owner_party_id', '')::uuid,
      coalesce(p_payload->>'scope', 'WAREHOUSE'),
      nullif(p_payload->>'product_id', '')::uuid,
      nullif(p_payload->>'category_code', ''),
      coalesce((v_before->>'policy_version')::int, 0) + 1,
      v_ts,
      coalesce(p_payload->'params', '{}'::jsonb),
      p_actor
    ) returning to_jsonb(warehouse_behavior_policies.*) into v_after;

    insert into public.audit_events (tenant_id, entity_type, entity_id, action, actor_user_id, source_channel, before_data, after_data)
    values (p_tenant, 'WAREHOUSE_POLICY', (v_after->>'id')::uuid, 'UPSERT_POLICY', p_actor, 'FORNEXA_WMS', v_before, v_after);

    return jsonb_build_object('ok', true, 'action', 'UPSERT_POLICY', 'policy', v_after);

  -- ── ACTION: UPSERT_RESOURCE ────────────────────────────────────────────────
  elsif p_action = 'UPSERT_RESOURCE' then
    if v_role not in ('OWNER','ADMIN','PLANNER') then
      raise exception 'WMS_FORBIDDEN';
    end if;
    v_warehouse_id := (p_payload->>'warehouse_id')::uuid;
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
      coalesce((p_payload->>'is_active')::boolean, true)
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
end $$;

revoke all on function public.fornexa_wms_action(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.fornexa_wms_action(uuid, uuid, text, jsonb, text) to service_role;

commit;
