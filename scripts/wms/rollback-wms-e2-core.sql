-- ============================================================================
-- SCRIPT: scripts/wms/rollback-wms-e2-core.sql
-- DESCRIPTION: Non-destructive rollback for WMS E2 Replenishment Core (20261024120000)
-- AUTHOR: Gemini (Fornexa)
-- DATE: 2026-11-05
-- REVERSIBILITY GUARANTEES:
-- 1. Preserves 100% of physical inventory (inventory_quants) and historical movements (inventory_movements).
-- 2. Preserves all pre-E2 table structures, including warehouse_tasks(source_bin_id, destination_bin_id)
--    and inventory_quants(flow_state) introduced in E1/C3.
-- 3. Inverts exactly the DDL added by 20261024120000_wms_e2_replenishment_core.sql:
--    - stock_reservations: drops stock_reservations_ref_idx, chk_stock_reservations_reference_type, reference_type, reference_id.
--    - warehouse_tasks: drops fk_warehouse_tasks_proposal and proposal_id only.
--    - inventory_quants: drops trg_protect_inventory_quants_received_at, inventory_quants_rotation_idx, received_at.
--    - replenishment: drops wms_proposals, replenishment_rules, and associated triggers/functions.
-- 4. Audit & Traceability Protection (MUST-G4):
--    If any proposal with status = 'EXECUTED' exists, rollback aborts fail-closed with WMS_ROLLBACK_BLOCKED
--    to prevent cutting the audit trail connecting physical movements to the authorizing operator/proposal.
--    If fornexa.allow_executed_proposals_drop = 'true' is explicitly set in transaction settings,
--    executed proposals are archived to public.wms_proposals_archive before dropping the main table.
-- 5. Collision Pre-Flight & Constraint Restoration (MUST-G3):
--    Before dropping uq_inventory_quant_hu and restoring the narrower pre-E2 constraint, a pre-flight
--    checks if multi-HU lot splits exist in the same bin. If duplicates exist, rollback aborts fail-closed
--    (WMS_ROLLBACK_BLOCKED_COLLISION) to protect inventory distinctions without silent merge or data loss.
-- ============================================================================

begin;

-- ── 0. Traceability Safety Guard (MUST-G4) ───────────────────────────────────
do $$
declare
  v_executed_count integer := 0;
  v_force_override text := coalesce(current_setting('fornexa.allow_executed_proposals_drop', true), 'false');
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'wms_proposals'
  ) then
    select count(*) into v_executed_count
      from public.wms_proposals
     where status = 'EXECUTED';

    if v_executed_count > 0 then
      if v_force_override <> 'true' then
        raise exception 'WMS_ROLLBACK_BLOCKED: % executed proposal(s) exist. Reversing E2 would destroy operational authorization audit trail. Set fornexa.allow_executed_proposals_drop = true to override after manual verification.', v_executed_count;
      end if;

      -- If explicitly overridden, archive executed proposals to preserve auditability
      create table if not exists public.wms_proposals_archive as
        select * from public.wms_proposals where status = 'EXECUTED';
    end if;
  end if;
end $$;

-- ── 1. Revert warehouse_tasks additions (MUST-G1) ─────────────────────────────
-- E2 only added proposal_id and fk_warehouse_tasks_proposal.
-- source_bin_id, destination_bin_id are pre-existing E1/C3 columns and MUST NOT be dropped.
alter table if exists public.warehouse_tasks
  drop constraint if exists fk_warehouse_tasks_proposal;

alter table if exists public.warehouse_tasks
  drop column if exists proposal_id;

-- ── 2. Revert stock_reservations additions (MUST-G2) ──────────────────────────
-- E2 added: reference_type, reference_id, chk_stock_reservations_reference_type, stock_reservations_ref_idx.
drop index if exists public.stock_reservations_ref_idx;

alter table if exists public.stock_reservations
  drop constraint if exists chk_stock_reservations_reference_type;

alter table if exists public.stock_reservations
  drop column if exists reference_type,
  drop column if exists reference_id;

-- ── 3. Drop E2 triggers and functions on core tables ──────────────────────────
drop trigger if exists trg_protect_inventory_quants_received_at on public.inventory_quants;
drop function if exists public.fornexa_protect_quant_received_at();

drop trigger if exists trg_cascade_rule_deactivation on public.replenishment_rules;
drop function if exists public.fornexa_wms_cascade_rule_deactivation();

drop trigger if exists trg_validate_proposal_bins on public.wms_proposals;
drop function if exists public.fornexa_validate_proposal_bins();

drop trigger if exists trg_wms_proposals_updated_at on public.wms_proposals;
drop trigger if exists trg_replenishment_rules_updated_at on public.replenishment_rules;

-- ── 4. Drop E2 dedicated tables ──────────────────────────────────────────────
drop table if exists public.wms_proposals cascade;
drop table if exists public.replenishment_rules cascade;

-- ── 5. Clean E2 added columns and index from inventory_quants ────────────────
-- E2 added: received_at and inventory_quants_rotation_idx.
-- flow_state was added in E1 and MUST NOT be touched.
drop index if exists public.inventory_quants_rotation_idx;

alter table if exists public.inventory_quants
  drop column if exists received_at;

-- ── 6. Constraint Collision Pre-Flight & Restoration (MUST-G3) ───────────────
do $$
declare
  v_collision_count integer := 0;
begin
  -- Pre-flight: verify if any duplicate quants exist under the narrower pre-E2 constraint
  select count(*) into v_collision_count from (
    select bin_id, product_id, owner_party_id, batch_number, serial_number, stock_status
      from public.inventory_quants
     group by bin_id, product_id, owner_party_id, batch_number, serial_number, stock_status
    having count(*) > 1
  ) dups;

  if v_collision_count > 0 then
    raise exception 'WMS_ROLLBACK_BLOCKED_COLLISION: Cannot restore narrow unique constraint without losing split pallet distinction (% collision groups detected). Resolve multi-HU lot splits before rollback.', v_collision_count;
  end if;

  -- Drop E2 widened constraint
  alter table if exists public.inventory_quants
    drop constraint if exists uq_inventory_quant_hu;

  -- Restore canonical pre-E2 unique constraint
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
