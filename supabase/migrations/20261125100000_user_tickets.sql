begin;

create table public.user_tickets (
  id uuid primary key default gen_random_uuid(),
  number integer generated always as identity unique,
  tenant_id uuid not null references public.tenants(id),
  reporter_id uuid not null default auth.uid(),
  assignee_id uuid,
  category text not null check (category in ('Incidencia', 'Consulta', 'Mejora')),
  area text not null check (area in ('TMS web', 'Android', 'Integraciones / EDI', 'Documentos', 'Accesos', 'Otra')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null check (char_length(btrim(description)) between 1 and 6000),
  reference text not null default '' check (char_length(reference) <= 100),
  priority text not null default 'Normal' check (priority in ('Baja', 'Normal', 'Alta', 'Urgente')),
  status text not null default 'Nuevo' check (status in ('Nuevo', 'En curso', 'Pendiente del usuario', 'Resuelto', 'Cerrado')),
  attachment_name text,
  attachment_data bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((attachment_name is null and attachment_data is null) or (
    attachment_name is not null and attachment_data is not null and
    char_length(attachment_name) between 1 and 180 and octet_length(attachment_data) between 1 and 3145728
  ))
);

create table public.user_ticket_activity (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.user_tickets(id),
  author_id uuid not null default auth.uid(),
  kind text not null default 'comment' check (kind in ('comment', 'management')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index user_tickets_tenant_updated_idx on public.user_tickets(tenant_id, updated_at desc, id);
create index user_tickets_reporter_updated_idx on public.user_tickets(tenant_id, reporter_id, updated_at desc, id);
create index user_ticket_activity_ticket_idx on public.user_ticket_activity(ticket_id, created_at, id);

create function private.fornexa_can_manage_tickets(target_tenant uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = target_tenant and user_id = (select auth.uid())
      and status = 'ACTIVE' and role in ('OWNER', 'ADMIN')
  );
$$;

revoke all on function private.fornexa_can_manage_tickets(uuid) from public, anon;
grant execute on function private.fornexa_can_manage_tickets(uuid) to authenticated;

alter table public.user_tickets enable row level security;
alter table public.user_ticket_activity enable row level security;
revoke all on public.user_tickets, public.user_ticket_activity from public, anon, authenticated;
grant select on public.user_tickets, public.user_ticket_activity to authenticated;
grant usage on sequence public.user_tickets_number_seq to authenticated;
grant insert (tenant_id, category, area, title, description, reference, attachment_name, attachment_data)
  on public.user_tickets to authenticated;
grant update (assignee_id, priority, status) on public.user_tickets to authenticated;
grant insert (ticket_id, body) on public.user_ticket_activity to authenticated;

create policy user_tickets_read on public.user_tickets for select to authenticated
  using (private.fornexa_has_tenant_access(tenant_id)
    and (reporter_id = (select auth.uid()) or private.fornexa_can_manage_tickets(tenant_id)));
create policy user_tickets_create on public.user_tickets for insert to authenticated
  with check (private.fornexa_has_tenant_access(tenant_id) and reporter_id = (select auth.uid()));
create policy user_tickets_manage on public.user_tickets for update to authenticated
  using (private.fornexa_can_manage_tickets(tenant_id))
  with check (private.fornexa_can_manage_tickets(tenant_id));

create policy user_ticket_activity_read on public.user_ticket_activity for select to authenticated
  using (exists (select 1 from public.user_tickets where id = ticket_id));
create policy user_ticket_activity_comment on public.user_ticket_activity for insert to authenticated
  with check (exists (select 1 from public.user_tickets where id = ticket_id));

create function private.fornexa_log_ticket_management()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  changes text[] := array[]::text[];
begin
  if new.assignee_id is distinct from old.assignee_id then
    if new.assignee_id is not null and new.assignee_id is distinct from auth.uid() then
      raise exception 'El responsable debe ser quien se asigna el ticket' using errcode = '42501';
    end if;
    changes := array_append(changes, case when new.assignee_id is null then 'Responsable retirado' else 'Ticket asignado a soporte' end);
  end if;
  if new.status is distinct from old.status then
    changes := array_append(changes, 'Estado: ' || old.status || ' → ' || new.status);
  end if;
  if new.priority is distinct from old.priority then
    changes := array_append(changes, 'Prioridad: ' || old.priority || ' → ' || new.priority);
  end if;
  if cardinality(changes) > 0 then
    new.updated_at := clock_timestamp();
    insert into public.user_ticket_activity (ticket_id, kind, body)
      values (new.id, 'management', array_to_string(changes, ' · '));
  end if;
  return new;
end;
$$;

create trigger user_tickets_log_management before update of assignee_id, priority, status
  on public.user_tickets for each row execute function private.fornexa_log_ticket_management();

create function private.fornexa_touch_commented_ticket()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.user_tickets set updated_at = clock_timestamp() where id = new.ticket_id;
  return new;
end;
$$;

create trigger user_ticket_activity_touch after insert on public.user_ticket_activity
  for each row when (new.kind = 'comment') execute function private.fornexa_touch_commented_ticket();

revoke all on function private.fornexa_log_ticket_management(), private.fornexa_touch_commented_ticket()
  from public, anon, authenticated;

insert into public.fornexa_schema_migrations (version, description)
values ('20261125100000', 'User tickets and activity');

commit;
