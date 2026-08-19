grant usage on schema private to anon, authenticated;

create or replace function private.fornexa_validate_review_token_impl(p_token text)
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

revoke all on function private.fornexa_validate_review_token_impl(text) from public;
grant execute on function private.fornexa_validate_review_token_impl(text) to anon, authenticated;

create or replace function public.fornexa_validate_review_token(p_token text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.fornexa_validate_review_token_impl(p_token);
$$;

revoke all on function public.fornexa_validate_review_token(text) from public;
grant execute on function public.fornexa_validate_review_token(text) to anon, authenticated;
