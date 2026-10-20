-- ============================================================================
-- ROLLBACK SCRIPT: 20261019120000_wms_c3_rollback_protected.sql
-- DESCRIPTION: Protected Rollback for C-3 (Server Load Controls)
-- GUARANTEE (MUST-2): Does NOT reopen E1 bypass vectors (payload overrides for
-- expected weight, volume, or consolidation remain strictly rejected/ignored).
-- Preserves audit history, idempotency keys, triggers, and schema columns without dropping.
-- Deliberate fail-closed shutdown: WMS_ROLLBACK_ACTIVE prevents operational bypass
-- without relaxing global security policies or dropping invalidation triggers.
-- ============================================================================

-- 1. Protected definition of fornexa_wms_action (C-3 Rollback)
-- Note: CONTROL_STATE is deactivated (WMS_FORBIDDEN). All other actions deliberately
-- raise WMS_ROLLBACK_ACTIVE (fail-closed shutdown) to prevent unvalidated operations
-- or regressions to client-override bypass vectors, while preserving all schema columns.
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

  if p_action = 'CONTROL_STATE' then
    -- CONTROL_STATE deactivated during rollback
    raise exception 'WMS_FORBIDDEN';
  end if;

  -- In rollback mode, deliberate fail-closed protective shutdown:
  -- WMS_ROLLBACK_ACTIVE prevents operational bypass without relaxing global security policies.
  raise exception 'WMS_ROLLBACK_ACTIVE';
end;
$$;
