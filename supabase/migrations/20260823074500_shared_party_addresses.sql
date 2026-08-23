create sequence if not exists public.party_address_code_seq start with 1001;

alter table public.party_addresses
  alter column code set default public.fornexa_next_code('DIR', 'public.party_address_code_seq');

create table if not exists public.party_address_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  address_id uuid not null references public.party_addresses(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,
  use_for_pickup boolean not null default true,
  use_for_delivery boolean not null default true,
  is_default_pickup boolean not null default false,
  is_default_delivery boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, address_id, party_id),
  check (use_for_pickup or use_for_delivery)
);

insert into public.party_address_assignments (
  tenant_id,
  address_id,
  party_id,
  use_for_pickup,
  use_for_delivery,
  is_default_pickup,
  is_default_delivery
)
select
  address.tenant_id,
  address.id,
  address.party_id,
  true,
  true,
  address.address_type = 'PICKUP',
  address.address_type = 'DELIVERY'
from public.party_addresses address
on conflict (tenant_id, address_id, party_id) do nothing;

create index if not exists party_address_assignments_party_idx
  on public.party_address_assignments (tenant_id, party_id, address_id);

create index if not exists party_address_assignments_address_idx
  on public.party_address_assignments (tenant_id, address_id, party_id);

alter table public.party_address_assignments enable row level security;

drop policy if exists tenant_isolation on public.party_address_assignments;
create policy tenant_isolation on public.party_address_assignments
  for all
  to authenticated
  using (public.fornexa_has_tenant_access(tenant_id))
  with check (public.fornexa_has_tenant_access(tenant_id));

grant select on public.party_address_assignments to authenticated;

comment on table public.party_address_assignments is
  'Relación reutilizable entre direcciones canónicas y empresas, con usos de recogida y entrega por cliente.';
