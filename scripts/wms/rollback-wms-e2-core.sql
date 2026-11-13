-- ============================================================================
-- SCRIPT: scripts/wms/rollback-wms-e2-core.sql
-- DESCRIPTION: Exact inverse of WMS E2 Replenishment Core (20261024120000), plus removal
--              of the E2-only RPC functions of 20261024120100.
-- ORIGINAL AUTHOR: Gemini (Fornexa), 2026-11-02
-- REVISED: Claude (Fornexa), 2026-11-05 — closes MUST-G1..G4 of the E2 contingency package.
--
-- GUARANTEES (each one enforced by code below, not only declared):
-- 1. Physical inventory (inventory_quants rows and quantities) and historical movements
--    (inventory_movements) are never touched.
-- 2. Only surface that E2 core ADDS is removed. Pre-E2 columns such as
--    warehouse_tasks.source_bin_id / destination_bin_id / target_hu_id and
--    inventory_quants.flow_state / hu_id are preserved (MUST-G1).
-- 3. Everything E2 core adds is removed, including stock_reservations.reference_type,
--    reference_id, chk_stock_reservations_reference_type and stock_reservations_ref_idx (MUST-G2).
-- 4. The pre-E2 unique key on inventory_quants is restored only if no two quants collide on it.
--    If they do (pallets of the same lot split by hu_id), the script aborts BEFORE changing
--    anything and names the condition, instead of failing half-way (MUST-G3).
-- 5. If EXECUTED proposals exist, the script aborts unless the operator explicitly confirms with
--      set fornexa.e2_rollback_confirm = 'ARCHIVE_EXECUTED_AND_PROCEED';
--    In every run, proposals, rules, task→proposal links and reservation references are
--    archived to private.wms_e2_rollback_archive before anything is dropped, so the chain
--    movement → task → proposal → approving operator is never lost (MUST-G4).
-- 6. Single transaction: either everything above happens or nothing does.
--
-- KNOWN LIMITATION (documented, not hidden): if the E2 RPC migration was applied, the
-- E2 version of public.fornexa_wms_action stays in place. Its pre-E2 actions keep working;
-- its E2-only actions fail with an error because their tables are gone. Restoring the exact
-- C3 body requires re-applying the C3 function definition from
-- supabase/migrations/20261019120000_wms_c3_server_load_controls.sql.
-- ============================================================================

begin;

-- 0. Pre-flight checks. Nothing is modified until all of them pass.
do $$
declare
  v_executed bigint := 0;
  v_collisions bigint := 0;
begin
  if to_regclass('public.wms_proposals') is not null then
    execute 'select count(*) from public.wms_proposals where status = ''EXECUTED''' into v_executed;
  end if;

  if v_executed > 0
     and coalesce(current_setting('fornexa.e2_rollback_confirm', true), '') <> 'ARCHIVE_EXECUTED_AND_PROCEED' then
    raise exception 'E2_ROLLBACK_BLOCKED_EXECUTED_PROPOSALS: % executed proposal(s) exist. Re-run after: set fornexa.e2_rollback_confirm = ''ARCHIVE_EXECUTED_AND_PROCEED'';', v_executed;
  end if;

  select count(*) into v_collisions
    from (
      select 1
        from public.inventory_quants
       group by bin_id, product_id, owner_party_id, batch_number, serial_number, stock_status
      having count(*) > 1
    ) c;

  if v_collisions > 0 then
    raise exception 'E2_ROLLBACK_BLOCKED_KEY_COLLISION: % group(s) of quants differ only by hu_id/tenant; the pre-E2 unique key cannot be restored without merging stock. Nothing was changed.', v_collisions;
  end if;
end $$;

-- 1. Archive everything E2 owns before removing it.
create schema if not exists private;
create table if not exists private.wms_e2_rollback_archive (
  id bigint generated always as identity primary key,
  archived_at timestamptz not null default now(),
  source text not null,
  row_data jsonb not null
);
revoke all on table private.wms_e2_rollback_archive from public;

do $$
begin
  if to_regclass('public.wms_proposals') is not null then
    execute 'insert into private.wms_e2_rollback_archive (source, row_data)
             select ''wms_proposals'', to_jsonb(p) from public.wms_proposals p';
  end if;
  if to_regclass('public.replenishment_rules') is not null then
    execute 'insert into private.wms_e2_rollback_archive (source, row_data)
             select ''replenishment_rules'', to_jsonb(r) from public.replenishment_rules r';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'warehouse_tasks' and column_name = 'proposal_id') then
    execute 'insert into private.wms_e2_rollback_archive (source, row_data)
             select ''warehouse_tasks.proposal_id'', jsonb_build_object(''tenant_id'', t.tenant_id, ''task_id'', t.id, ''proposal_id'', t.proposal_id)
               from public.warehouse_tasks t where t.proposal_id is not null';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'stock_reservations' and column_name = 'reference_id') then
    execute 'insert into private.wms_e2_rollback_archive (source, row_data)
             select ''stock_reservations.reference'', jsonb_build_object(''tenant_id'', s.tenant_id, ''reservation_id'', s.id, ''reference_type'', s.reference_type, ''reference_id'', s.reference_id)
               from public.stock_reservations s
              where s.reference_id is not null or s.reference_type is distinct from ''ORDER''';
  end if;
end $$;

-- 2. Remove the E2-only RPC functions (20261024120100). fornexa_wms_action stays: see header.
drop function if exists public.fornexa_wms_evaluate_replenishment(uuid, uuid, uuid, uuid, uuid, uuid, uuid, numeric);
drop function if exists public.fornexa_wms_approve_proposal(uuid, uuid, uuid);
drop function if exists public.fornexa_wms_reject_proposal(uuid, uuid, uuid, text);
drop function if exists public.fornexa_wms_cancel_proposal(uuid, uuid, uuid, text);
drop function if exists public.fornexa_wms_replenish(uuid, uuid, uuid, text, jsonb);

-- 3. warehouse_tasks: E2 added ONLY proposal_id and its FK. Pre-E2 columns stay (MUST-G1).
alter table if exists public.warehouse_tasks
  drop constraint if exists fk_warehouse_tasks_proposal;
alter table if exists public.warehouse_tasks
  drop column if exists proposal_id;

-- 4. stock_reservations: exact inverse of what E2 added (MUST-G2).
drop index if exists public.stock_reservations_ref_idx;
alter table if exists public.stock_reservations
  drop constraint if exists chk_stock_reservations_reference_type;
alter table if exists public.stock_reservations
  drop column if exists reference_id,
  drop column if exists reference_type;

-- 5. E2 triggers and functions.
drop trigger if exists trg_protect_inventory_quants_received_at on public.inventory_quants;
drop function if exists public.fornexa_protect_quant_received_at();

drop trigger if exists trg_cascade_rule_deactivation on public.replenishment_rules;
drop function if exists public.fornexa_wms_cascade_rule_deactivation();

drop trigger if exists trg_validate_proposal_bins on public.wms_proposals;
drop function if exists public.fornexa_validate_proposal_bins();

drop trigger if exists trg_wms_proposals_updated_at on public.wms_proposals;
drop trigger if exists trg_replenishment_rules_updated_at on public.replenishment_rules;

-- 6. E2 tables (already archived in step 1).
drop table if exists public.wms_proposals cascade;
drop table if exists public.replenishment_rules cascade;

-- 7. inventory_quants: E2 added ONLY received_at and the rotation index. flow_state and hu_id stay.
drop index if exists public.inventory_quants_rotation_idx;
alter table if exists public.inventory_quants
  drop column if exists received_at;

-- 8. Restore the pre-E2 unique key (collisions were ruled out in step 0).
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
