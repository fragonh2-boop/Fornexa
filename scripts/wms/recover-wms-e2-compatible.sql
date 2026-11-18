-- PRESERVE_HU is forward recovery, not the inverse of E2 DDL.
-- Keep every live row, relationship and HU-aware key; freeze E2 entrypoints.
-- Build with build-e2-recovery.mjs so the pinned C3 action and ACL are restored
-- in this same transaction, without replaying C3 migration backfills.
begin;

do $$
begin
  if coalesce(current_setting('fornexa.e2_recovery_confirm', true), '') <> 'PRESERVE_HU_AND_RESTORE_C3' then
    raise exception 'E2_RECOVERY_CONFIRM_REQUIRED';
  end if;
  if to_regclass('public.wms_proposals') is null or to_regclass('public.replenishment_rules') is null then
    raise exception 'E2_RECOVERY_REQUIRES_CORE';
  end if;
  if not exists (
    select 1 from pg_proc
     where oid = to_regprocedure('public.fornexa_wms_action(uuid,uuid,text,jsonb,text)')
       and encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') = '45b5ac3b4132e408d46d5b39bd6c39b2e7abcc4dd56eaa3629f1692e90dd0c64'
       and prosecdef and proconfig = array['search_path=""']
  ) then
    raise exception 'E2_RECOVERY_C3_RESTORE_REQUIRED';
  end if;
end $$;

-- Fixed lock order gives one consistent archive/snapshot and excludes concurrent
-- stock/tasks/proposals mutations. The bundle's lock timeout aborts on contention.
lock table public.handling_units, public.inventory_movements, public.inventory_quants,
  public.replenishment_rules, public.stock_reservations, public.warehouse_tasks,
  public.wms_proposals in share row exclusive mode;

create schema if not exists private;
create table if not exists private.wms_e2_recovery_archive (
  id bigint generated always as identity primary key,
  archived_at timestamptz not null default now(),
  source text not null,
  row_sha256 text not null,
  row_data jsonb not null,
  unique (source, row_sha256)
);
alter table private.wms_e2_recovery_archive enable row level security;
revoke all on table private.wms_e2_recovery_archive from public, anon, authenticated, service_role;
revoke all on sequence private.wms_e2_recovery_archive_id_seq from public, anon, authenticated, service_role;

insert into private.wms_e2_recovery_archive (source, row_sha256, row_data)
select 'wms_proposals', encode(sha256(convert_to(to_jsonb(p)::text, 'UTF8')), 'hex'), to_jsonb(p)
  from public.wms_proposals p on conflict (source, row_sha256) do nothing;
insert into private.wms_e2_recovery_archive (source, row_sha256, row_data)
select 'replenishment_rules', encode(sha256(convert_to(to_jsonb(r)::text, 'UTF8')), 'hex'), to_jsonb(r)
  from public.replenishment_rules r on conflict (source, row_sha256) do nothing;
insert into private.wms_e2_recovery_archive (source, row_sha256, row_data)
select 'warehouse_tasks.proposal_id', encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex'), to_jsonb(t)
  from public.warehouse_tasks t where t.proposal_id is not null
on conflict (source, row_sha256) do nothing;
insert into private.wms_e2_recovery_archive (source, row_sha256, row_data)
select 'stock_reservations.reference', encode(sha256(convert_to(to_jsonb(s)::text, 'UTF8')), 'hex'), to_jsonb(s)
  from public.stock_reservations s
 where s.reference_id is not null or s.reference_type is distinct from 'ORDER'
on conflict (source, row_sha256) do nothing;

-- Keep the E2 schema and traceability in place, but remove application access to
-- its mutating RPCs/tables. Re-enabling E2 needs a separate reviewed roll-forward.
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.fornexa_wms_evaluate_replenishment(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric)',
    'public.fornexa_wms_approve_proposal(uuid,uuid,uuid)',
    'public.fornexa_wms_reject_proposal(uuid,uuid,uuid,text)',
    'public.fornexa_wms_cancel_proposal(uuid,uuid,uuid,text)',
    'public.fornexa_wms_replenish(uuid,uuid,uuid,text,jsonb)'
  ] loop
    if to_regprocedure(signature) is not null then
      execute 'revoke all on function ' || signature || ' from public, anon, authenticated, service_role';
    end if;
  end loop;
end $$;
revoke insert, update, delete, truncate, references, trigger
  on public.wms_proposals, public.replenishment_rules from public, anon, authenticated, service_role;

-- C3 is intentionally restored byte-for-byte. Its shared task/reservation paths
-- must not become an indirect way to mutate E2 links while E2 is frozen.
create or replace function public.fornexa_wms_e2_frozen_link_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name in ('wms_proposals', 'replenishment_rules') then
    raise exception 'WMS_E2_FROZEN';
  end if;
  -- TRUNCATE bypasses RLS. Never decide whether it is safe by counting
  -- rows visible to SECURITY INVOKER; frozen tables reject it unconditionally.
  if tg_op = 'TRUNCATE' then raise exception 'WMS_E2_FROZEN'; end if;
  if tg_table_name = 'warehouse_tasks' then
    if tg_op <> 'INSERT' then
      if old.proposal_id is not null then raise exception 'WMS_E2_FROZEN'; end if;
    end if;
    if tg_op <> 'DELETE' then
      if new.proposal_id is not null then raise exception 'WMS_E2_FROZEN'; end if;
    end if;
  elsif tg_table_name = 'stock_reservations' then
    if tg_op <> 'INSERT' then
      if old.reference_id is not null or old.reference_type in ('REPLENISHMENT_PROPOSAL', 'MANUAL') then
        raise exception 'WMS_E2_FROZEN';
      end if;
    end if;
    if tg_op <> 'DELETE' then
      if new.reference_id is not null or new.reference_type in ('REPLENISHMENT_PROPOSAL', 'MANUAL') then
        raise exception 'WMS_E2_FROZEN';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.fornexa_wms_e2_frozen_link_guard() from public, anon, authenticated, service_role;
drop trigger if exists trg_wms_e2_frozen_task on public.warehouse_tasks;
create trigger trg_wms_e2_frozen_task before insert or update or delete on public.warehouse_tasks
  for each row execute function public.fornexa_wms_e2_frozen_link_guard();
drop trigger if exists trg_wms_e2_frozen_reservation on public.stock_reservations;
create trigger trg_wms_e2_frozen_reservation before insert or update or delete on public.stock_reservations
  for each row execute function public.fornexa_wms_e2_frozen_link_guard();
drop trigger if exists trg_wms_e2_frozen_proposal on public.wms_proposals;
create trigger trg_wms_e2_frozen_proposal before insert or update or delete on public.wms_proposals
  for each row execute function public.fornexa_wms_e2_frozen_link_guard();
drop trigger if exists trg_wms_e2_frozen_rule on public.replenishment_rules;
create trigger trg_wms_e2_frozen_rule before insert or update or delete on public.replenishment_rules
  for each row execute function public.fornexa_wms_e2_frozen_link_guard();
drop trigger if exists trg_wms_e2_frozen_task_truncate on public.warehouse_tasks;
create trigger trg_wms_e2_frozen_task_truncate before truncate on public.warehouse_tasks
  for each statement execute function public.fornexa_wms_e2_frozen_link_guard();
drop trigger if exists trg_wms_e2_frozen_reservation_truncate on public.stock_reservations;
create trigger trg_wms_e2_frozen_reservation_truncate before truncate on public.stock_reservations
  for each statement execute function public.fornexa_wms_e2_frozen_link_guard();
drop trigger if exists trg_wms_e2_frozen_proposal_truncate on public.wms_proposals;
create trigger trg_wms_e2_frozen_proposal_truncate before truncate on public.wms_proposals
  for each statement execute function public.fornexa_wms_e2_frozen_link_guard();
drop trigger if exists trg_wms_e2_frozen_rule_truncate on public.replenishment_rules;
create trigger trg_wms_e2_frozen_rule_truncate before truncate on public.replenishment_rules
  for each statement execute function public.fornexa_wms_e2_frozen_link_guard();

commit;
