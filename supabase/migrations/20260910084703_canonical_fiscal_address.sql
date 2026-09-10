-- Canonical FISCAL domicile for regulatory-document source data.
-- Additive only: no backfill. The migration fails closed if legacy data already
-- violates the intended invariant, so it can be reconciled explicitly.

do $$
begin
  if exists (
    select 1
    from public.party_addresses
    where address_type = 'FISCAL'
      and is_active
    group by tenant_id, party_id
    having count(*) > 1
  ) then
    raise exception 'Multiple active FISCAL addresses must be reconciled before migration';
  end if;

  if exists (
    select 1
    from public.party_addresses
    where code = 'FISCAL'
      and address_type <> 'FISCAL'
  ) then
    raise exception 'Reserved FISCAL code is already used by a non-FISCAL address';
  end if;
end
$$;

create unique index if not exists party_addresses_one_active_fiscal_per_party_idx
  on public.party_addresses (tenant_id, party_id)
  where address_type = 'FISCAL' and is_active;

alter table public.party_addresses
  add constraint party_addresses_reserved_fiscal_code_check
  check (code is distinct from 'FISCAL' or address_type = 'FISCAL');

create or replace function public.fornexa_upsert_canonical_fiscal_address(
  p_tenant_id uuid,
  p_party_id uuid,
  p_actor_user_id uuid,
  p_name text,
  p_address_line1 text,
  p_address_line2 text,
  p_postal_code text,
  p_city text,
  p_region text,
  p_country_code text
)
returns table (
  id uuid,
  code text,
  name text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  region text,
  country_code character(2),
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_active public.party_addresses%rowtype;
  v_reserved public.party_addresses%rowtype;
  v_persisted public.party_addresses%rowtype;
  v_before jsonb;
  v_action text;
begin
  if p_tenant_id is null or p_party_id is null or p_actor_user_id is null then
    raise exception 'Tenant, party and actor are required' using errcode = '22023';
  end if;

  if p_address_line1 is null or length(btrim(p_address_line1)) < 5
     or p_city is null or btrim(p_city) = ''
     or p_country_code is null or upper(btrim(p_country_code)) !~ '^[A-Z]{2}$' then
    raise exception 'Invalid canonical FISCAL domicile' using errcode = '22023';
  end if;

  -- Serialize all canonical-FISCAL writes for one party and verify tenant scope.
  perform 1
  from public.parties as p
  where p.id = p_party_id
    and p.tenant_id = p_tenant_id
    and p.is_customer = true
  for update;

  if not found then
    raise exception 'Customer tenant mismatch' using errcode = '23503';
  end if;

  select pa.*
  into v_active
  from public.party_addresses as pa
  where pa.tenant_id = p_tenant_id
    and pa.party_id = p_party_id
    and pa.address_type = 'FISCAL'
    and pa.is_active
  order by pa.updated_at desc
  limit 1
  for update;

  select pa.*
  into v_reserved
  from public.party_addresses as pa
  where pa.tenant_id = p_tenant_id
    and pa.party_id = p_party_id
    and pa.code = 'FISCAL'
  limit 1
  for update;

  if v_reserved.id is not null and v_reserved.address_type <> 'FISCAL' then
    raise exception 'Reserved FISCAL code belongs to a non-FISCAL address' using errcode = '22023';
  end if;

  if v_active.id is not null
     and v_reserved.id is not null
     and v_active.id <> v_reserved.id then
    raise exception 'Ambiguous canonical FISCAL address state' using errcode = '22023';
  end if;

  if v_active.id is not null then
    v_before := jsonb_build_object(
      'code', v_active.code,
      'addressType', v_active.address_type,
      'countryCode', btrim(v_active.country_code::text),
      'isActive', v_active.is_active
    );

    update public.party_addresses as pa
    set code = 'FISCAL',
        address_type = 'FISCAL',
        name = coalesce(nullif(btrim(p_name), ''), 'Domicilio fiscal'),
        address_line1 = btrim(p_address_line1),
        address_line2 = nullif(btrim(p_address_line2), ''),
        postal_code = nullif(btrim(p_postal_code), ''),
        city = btrim(p_city),
        region = nullif(btrim(p_region), ''),
        country_code = upper(btrim(p_country_code)),
        is_active = true,
        updated_at = now()
    where pa.id = v_active.id
      and pa.tenant_id = p_tenant_id
      and pa.party_id = p_party_id
    returning pa.* into v_persisted;

    v_action := 'UPDATE_FISCAL';
  elsif v_reserved.id is not null then
    v_before := jsonb_build_object(
      'code', v_reserved.code,
      'addressType', v_reserved.address_type,
      'countryCode', btrim(v_reserved.country_code::text),
      'isActive', v_reserved.is_active
    );

    update public.party_addresses as pa
    set address_type = 'FISCAL',
        name = coalesce(nullif(btrim(p_name), ''), 'Domicilio fiscal'),
        address_line1 = btrim(p_address_line1),
        address_line2 = nullif(btrim(p_address_line2), ''),
        postal_code = nullif(btrim(p_postal_code), ''),
        city = btrim(p_city),
        region = nullif(btrim(p_region), ''),
        country_code = upper(btrim(p_country_code)),
        is_active = true,
        updated_at = now()
    where pa.id = v_reserved.id
      and pa.tenant_id = p_tenant_id
      and pa.party_id = p_party_id
    returning pa.* into v_persisted;

    v_action := 'UPDATE_FISCAL';
  else
    insert into public.party_addresses (
      tenant_id,
      party_id,
      code,
      address_type,
      name,
      address_line1,
      address_line2,
      postal_code,
      city,
      region,
      country_code,
      is_active
    ) values (
      p_tenant_id,
      p_party_id,
      'FISCAL',
      'FISCAL',
      coalesce(nullif(btrim(p_name), ''), 'Domicilio fiscal'),
      btrim(p_address_line1),
      nullif(btrim(p_address_line2), ''),
      nullif(btrim(p_postal_code), ''),
      btrim(p_city),
      nullif(btrim(p_region), ''),
      upper(btrim(p_country_code)),
      true
    )
    returning * into v_persisted;

    v_action := 'CREATE_FISCAL';
  end if;

  -- Audit is intentionally inside the same database transaction. Any audit
  -- failure aborts the address mutation instead of silently losing evidence.
  insert into public.audit_events (
    tenant_id,
    entity_type,
    entity_id,
    action,
    actor_user_id,
    source_channel,
    changed_fields,
    before_data,
    after_data
  ) values (
    p_tenant_id,
    'party_address',
    v_persisted.id,
    v_action,
    p_actor_user_id,
    'FORNEXA_WEB',
    array['fiscal_domicile']::text[],
    v_before,
    jsonb_build_object(
      'addressType', 'FISCAL',
      'code', 'FISCAL',
      'countryCode', btrim(v_persisted.country_code::text),
      'isActive', v_persisted.is_active
    )
  );

  return query
  select
    v_persisted.id,
    v_persisted.code,
    v_persisted.name,
    v_persisted.address_line1,
    v_persisted.address_line2,
    v_persisted.postal_code,
    v_persisted.city,
    v_persisted.region,
    v_persisted.country_code,
    v_persisted.updated_at;
end;
$$;

revoke execute on function public.fornexa_upsert_canonical_fiscal_address(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.fornexa_upsert_canonical_fiscal_address(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) to service_role;
