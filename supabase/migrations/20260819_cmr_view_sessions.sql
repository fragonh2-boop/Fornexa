create table if not exists public.cmr_view_sessions (
  token_hash text primary key,
  cmr_id uuid not null references public.cmr_documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null
);

create index if not exists cmr_view_sessions_cmr_id_idx
  on public.cmr_view_sessions(cmr_id);

alter table public.cmr_view_sessions enable row level security;

-- View sessions are server-side capabilities. Browser roles never read or write
-- session rows directly; service-role code performs the lifecycle checks.
drop policy if exists deny_client_access on public.cmr_view_sessions;
create policy deny_client_access
  on public.cmr_view_sessions
  for all
  to anon, authenticated
  using (false)
  with check (false);
