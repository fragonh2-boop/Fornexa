alter table public.party_addresses
  add column if not exists subdivision_key text;

create index if not exists party_addresses_tenant_country_subdivision_idx
  on public.party_addresses (tenant_id, country_code, subdivision_key)
  where subdivision_key is not null;
