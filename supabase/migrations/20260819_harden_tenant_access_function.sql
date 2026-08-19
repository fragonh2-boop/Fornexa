create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.fornexa_has_tenant_access(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members
    where tenant_id = target_tenant_id
      and user_id = (select auth.uid())
      and status = 'ACTIVE'
  );
$$;

alter function private.fornexa_has_tenant_access(uuid) owner to postgres;
revoke all on function private.fornexa_has_tenant_access(uuid) from public;
revoke all on function private.fornexa_has_tenant_access(uuid) from anon;
grant execute on function private.fornexa_has_tenant_access(uuid) to authenticated;

create or replace function public.fornexa_has_tenant_access(target_tenant_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.fornexa_has_tenant_access(target_tenant_id);
$$;

alter function public.fornexa_has_tenant_access(uuid) owner to postgres;
revoke all on function public.fornexa_has_tenant_access(uuid) from public;
revoke all on function public.fornexa_has_tenant_access(uuid) from anon;
grant execute on function public.fornexa_has_tenant_access(uuid) to authenticated;
