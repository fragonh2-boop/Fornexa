-- ============================================================================
-- MIGRATION: 20261024120000_wms_e2_replenishment_core.sql
-- DESCRIPTION: WMS E2 Internal Replenishment Schema, Rules, Proposals, and Invariant Controls
-- AUTHOR: Gemini (Fornexa)
-- DATE: 2026-10-24
-- CONTRACT: docs/architecture/wms-e2-replenishment-technical-contract.md (HEAD b03ad954)
-- ============================================================================

begin;

-- ── 1. Replenishment Rules Table ─────────────────────────────────────────────
create table if not exists public.replenishment_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  warehouse_id uuid not null,
  product_id uuid not null,
  destination_bin_id uuid not null,
  min_quantity numeric(12,3) not null default 0,
  max_quantity numeric(12,3) not null,
  reorder_quantity numeric(12,3) not null default 1,
  consolidation text not null default 'YES',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_replenishment_min_qty check (min_quantity >= 0),
  constraint chk_replenishment_max_qty check (max_quantity > min_quantity),
  constraint chk_replenishment_reorder_qty check (reorder_quantity > 0),
  constraint chk_replenishment_consolidation check (consolidation in ('NO', 'YES', 'BY_BATCH')),
  constraint uq_replenishment_tenant_id unique (tenant_id, id),
  constraint uq_replenishment_rule_target unique (tenant_id, warehouse_id, product_id, destination_bin_id),
  constraint fk_replenishment_warehouse foreign key (tenant_id, warehouse_id) references public.warehouses(tenant_id, id) on delete restrict,
  constraint fk_replenishment_product foreign key (tenant_id, product_id) references public.products(tenant_id, id) on delete restrict,
  constraint fk_replenishment_dest_bin foreign key (tenant_id, destination_bin_id) references public.warehouse_bins(tenant_id, id) on delete restrict
);

drop trigger if exists trg_replenishment_rules_updated_at on public.replenishment_rules;
create trigger trg_replenishment_rules_updated_at
  before update on public.replenishment_rules
  for each row execute function public.fornexa_set_updated_at();

-- ── 2. WMS Replenishment Proposals Table ──────────────────────────────────────
create table if not exists public.wms_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  warehouse_id uuid not null,
  rule_id uuid,
  order_id uuid,
  proposal_type text not null default 'REPLENISHMENT',
  product_id uuid not null,
  batch_number text,
  source_bin_id uuid not null,
  source_hu_id uuid,
  source_quant_id uuid not null,
  destination_bin_id uuid not null,
  target_hu_id uuid,
  suggested_quantity numeric(12,3) not null,
  uom text not null default 'UN',
  status text not null default 'DRAFT',
  task_id uuid,
  idempotency_key text,
  idempotency_fingerprint text,
  execution_result jsonb,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  executed_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_proposal_qty check (suggested_quantity > 0),
  constraint chk_proposal_status check (status in ('DRAFT', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED')),
  constraint chk_proposal_type check (proposal_type in ('REPLENISHMENT', 'RELOCATION', 'CONSOLIDATION')),
  constraint uq_wms_proposals_tenant_id unique (tenant_id, id),
  constraint fk_proposal_warehouse foreign key (tenant_id, warehouse_id) references public.warehouses(tenant_id, id) on delete restrict,
  constraint fk_proposal_product foreign key (tenant_id, product_id) references public.products(tenant_id, id) on delete restrict,
  constraint fk_proposal_rule foreign key (tenant_id, rule_id) references public.replenishment_rules(tenant_id, id) on delete restrict,
  constraint fk_proposal_source_hu foreign key (tenant_id, source_hu_id) references public.handling_units(tenant_id, id) on delete restrict,
  constraint fk_proposal_target_hu foreign key (tenant_id, target_hu_id) references public.handling_units(tenant_id, id) on delete restrict,
  constraint fk_proposal_source_quant foreign key (tenant_id, source_quant_id) references public.inventory_quants(tenant_id, id) on delete restrict,
  constraint fk_proposal_task foreign key (tenant_id, task_id) references public.warehouse_tasks(tenant_id, id) on delete restrict,
  constraint fk_proposal_src_bin foreign key (tenant_id, source_bin_id) references public.warehouse_bins(tenant_id, id) on delete restrict,
  constraint fk_proposal_dest_bin foreign key (tenant_id, destination_bin_id) references public.warehouse_bins(tenant_id, id) on delete restrict
);

drop trigger if exists trg_wms_proposals_updated_at on public.wms_proposals;
create trigger trg_wms_proposals_updated_at
  before update on public.wms_proposals
  for each row execute function public.fornexa_set_updated_at();

-- Partial unique indices:
create unique index if not exists uq_wms_proposals_active_rule
  on public.wms_proposals (tenant_id, warehouse_id, product_id, destination_bin_id)
  where status in ('DRAFT', 'APPROVED') and rule_id is not null and order_id is null;

create unique index if not exists uq_wms_proposals_active_order
  on public.wms_proposals (tenant_id, warehouse_id, product_id, destination_bin_id, order_id)
  where status in ('DRAFT', 'APPROVED') and order_id is not null;

-- ── 3. Proposal Bins Validation Trigger ───────────────────────────────────────
create or replace function public.fornexa_validate_proposal_bins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src_wh uuid;
  v_dest_wh uuid;
begin
  select warehouse_id into v_src_wh
    from public.warehouse_bins
   where tenant_id = new.tenant_id and id = new.source_bin_id;
  if v_src_wh is distinct from new.warehouse_id then
    raise exception 'WMS_CROSS_WAREHOUSE_INVALID';
  end if;

  select warehouse_id into v_dest_wh
    from public.warehouse_bins
   where tenant_id = new.tenant_id and id = new.destination_bin_id;
  if v_dest_wh is distinct from new.warehouse_id then
    raise exception 'WMS_CROSS_WAREHOUSE_INVALID';
  end if;

  if new.source_bin_id = new.destination_bin_id then
    raise exception 'WMS_SAME_BIN_INVALID';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_proposal_bins on public.wms_proposals;
create trigger trg_validate_proposal_bins
  before insert or update of source_bin_id, destination_bin_id, warehouse_id on public.wms_proposals
  for each row execute function public.fornexa_validate_proposal_bins();

-- ── 4. Extension on inventory_quants: Immutable received_at ──────────────────
alter table public.inventory_quants
  add column if not exists received_at timestamptz;

update public.inventory_quants q
   set received_at = coalesce(
     (select min(coalesce(im.completed_at, im.requested_at))
        from public.inventory_movements im
       where im.tenant_id = q.tenant_id
         and im.warehouse_id = q.warehouse_id
         and im.product_id = q.product_id
         and im.destination_bin_id = q.bin_id
         and im.movement_type in ('RECEIPT', 'PUTAWAY')
         and (q.batch_number is null or im.batch_number = q.batch_number)),
     (select min(coalesce(im.completed_at, im.requested_at))
        from public.inventory_movements im
       where im.tenant_id = q.tenant_id
         and im.warehouse_id = q.warehouse_id
         and im.product_id = q.product_id
         and im.movement_type in ('RECEIPT', 'PUTAWAY')
         and (q.batch_number is null or im.batch_number = q.batch_number)),
     q.created_at
   )
 where q.received_at is null;

create index if not exists inventory_quants_rotation_idx
  on public.inventory_quants(tenant_id, warehouse_id, product_id, stock_status, flow_state, expiry_date, received_at);

create or replace function public.fornexa_protect_quant_received_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.received_at is not null and new.received_at > old.received_at then
    raise exception 'WMS_IMMUTABLE_RECEIVED_AT';
  end if;
  if old.received_at is not null and new.received_at is null then
    raise exception 'WMS_IMMUTABLE_RECEIVED_AT';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_inventory_quants_received_at on public.inventory_quants;
create trigger trg_protect_inventory_quants_received_at
  before update on public.inventory_quants
  for each row execute function public.fornexa_protect_quant_received_at();

-- ── 5. Extension on stock_reservations: Reference to Proposals ─────────────────
alter table public.stock_reservations
  add column if not exists reference_type text default 'ORDER',
  add column if not exists reference_id uuid;

alter table public.stock_reservations
  drop constraint if exists chk_stock_reservations_reference_type;

alter table public.stock_reservations
  add constraint chk_stock_reservations_reference_type
  check (reference_type in ('ORDER', 'REPLENISHMENT_PROPOSAL', 'MANUAL'));

create index if not exists stock_reservations_ref_idx
  on public.stock_reservations(tenant_id, reference_type, reference_id)
  where reference_id is not null;

-- ── 6. Extension on warehouse_tasks: Proposal Linkage ─────────────────────────
alter table public.warehouse_tasks
  add column if not exists proposal_id uuid;

alter table public.warehouse_tasks
  drop constraint if exists fk_warehouse_tasks_proposal;

alter table public.warehouse_tasks
  add constraint fk_warehouse_tasks_proposal
  foreign key (tenant_id, proposal_id)
  references public.wms_proposals(tenant_id, id)
  on delete restrict;

-- ── 7. Row Level Security & Grants ───────────────────────────────────────────
alter table public.replenishment_rules enable row level security;
alter table public.wms_proposals enable row level security;

drop policy if exists replenishment_rules_tenant_isolation on public.replenishment_rules;
create policy replenishment_rules_tenant_isolation on public.replenishment_rules
  for all using (fornexa_has_tenant_access(tenant_id));

drop policy if exists wms_proposals_tenant_isolation on public.wms_proposals;
create policy wms_proposals_tenant_isolation on public.wms_proposals
  for all using (fornexa_has_tenant_access(tenant_id));

grant select on public.replenishment_rules to authenticated;
grant select on public.wms_proposals to authenticated;
revoke insert, update, delete on public.replenishment_rules from authenticated;
revoke insert, update, delete on public.wms_proposals from authenticated;
revoke all on public.replenishment_rules from anon;
revoke all on public.wms_proposals from anon;

commit;
