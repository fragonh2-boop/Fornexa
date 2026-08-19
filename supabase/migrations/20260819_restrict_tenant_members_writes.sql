drop policy if exists tenant_isolation on public.tenant_members;

create policy tenant_member_select
on public.tenant_members
for select
to authenticated
using (public.fornexa_has_tenant_access(tenant_id));
