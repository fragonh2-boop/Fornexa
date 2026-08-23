create index if not exists party_address_assignments_created_by_idx
  on public.party_address_assignments (created_by)
  where created_by is not null;
