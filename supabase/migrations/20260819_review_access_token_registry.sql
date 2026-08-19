create schema if not exists private;

create table if not exists private.review_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  expires_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table private.review_access_tokens from public, anon, authenticated;

-- Initial review capability. Store only the SHA-256 hash, never the plaintext token.
insert into private.review_access_tokens (token_hash, tenant_id)
values ('cd148e817c92d5ad79fdb958fa624024003189bf37fe51fb4823dff9d0401aca', '00000000-0000-4000-8000-000000000001')
on conflict (token_hash) do update
set tenant_id = excluded.tenant_id,
    revoked_at = null,
    updated_at = now();

create or replace function public.fornexa_validate_review_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from private.review_access_tokens t
    where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and t.revoked_at is null
      and (t.expires_at is null or t.expires_at > now())
  ), false);
$$;

revoke all on function public.fornexa_validate_review_token(text) from public;
grant execute on function public.fornexa_validate_review_token(text) to anon, authenticated;
