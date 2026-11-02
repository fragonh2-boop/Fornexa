-- ============================================================================
-- SCRIPT: scripts/wms/rollback-wms-e2-core.sql
-- DESCRIPTION: Non-destructive rollback for WMS E2 Replenishment Core (20261024120000)
-- AUTHOR: Gemini (Fornexa)
-- DATE: 2026-11-02
-- REVERSIBILITY GUARANTEES:
-- 1. Preserves 100% of physical inventory (inventory_quants) and historical movements (inventory_movements).
-- 2. Leaves C3 server load controls and warehouse behavior policies fully operational.
-- 3. Safely removes E2 replenishment tables, triggers, and auxiliary columns.
-- 4. Restores canonical pre-E2 inventory_quants unique constraint.
-- ============================================================================

begin;

-- Safety guard: check if any executed proposals exist
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'wms_proposals'
  ) then
    if exists (
      select 1 from public.wms_proposals where status = 'EXECUTED'
    ) then
      raise notice 'WMS E2 Rollback: executed proposals exist; physical movements already recorded remain immutable';
    end if;
  end if;
end $$;

-- 1. Remove E2 foreign key references on warehouse_tasks and stock_reservations
alter table if exists public.stock_reservations
  drop column if exists proposal_id,
  drop column if exists allocated_reference_id;

drop index if exists public.stock_reservations_ref_idx;

alter table if exists public.warehouse_tasks
  drop column if exists proposal_id,
  drop column if exists target_hu_id,
  drop column if exists destination_bin_id,
  drop column if exists source_bin_id;

-- 2. Drop E2 triggers and functions on core tables
drop trigger if exists trg_protect_inventory_quants_received_at on public.inventory_quants;
drop function if exists public.fornexa_protect_quant_received_at();

drop trigger if exists trg_cascade_rule_deactivation on public.replenishment_rules;
drop function if exists public.fornexa_wms_cascade_rule_deactivation();

drop trigger if exists trg_validate_proposal_bins on public.wms_proposals;
drop function if exists public.fornexa_validate_proposal_bins();

drop trigger if exists trg_wms_proposals_updated_at on public.wms_proposals;
drop trigger if exists trg_replenishment_rules_updated_at on public.replenishment_rules;

-- 3. Drop E2 dedicated tables
drop table if exists public.wms_proposals cascade;
drop table if exists public.replenishment_rules cascade;

-- 4. Clean E2 added columns and index from inventory_quants without altering stock quantities
drop index if exists public.inventory_quants_rotation_idx;

alter table if exists public.inventory_quants
  drop column if exists allocated_reference_id,
  drop column if exists received_at;

-- 5. Restore canonical pre-E2 unique constraint on inventory_quants
alter table if exists public.inventory_quants
  drop constraint if exists uq_inventory_quant_hu;

do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conrelid = 'public.inventory_quants'::regclass 
      and conname = 'inventory_quants_bin_id_product_id_owner_party_id_batch_num_key'
  ) then
    alter table public.inventory_quants
      add constraint inventory_quants_bin_id_product_id_owner_party_id_batch_num_key
      unique nulls not distinct (bin_id, product_id, owner_party_id, batch_number, serial_number, stock_status);
  end if;
end $$;

commit;
