begin;

create function private.fornexa_valid_ticket_attachments(metadata jsonb, payloads jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare
  file jsonb;
  file_id text;
  seen text[] := array[]::text[];
  payload text;
  total integer := 0;
begin
  if jsonb_typeof(metadata) <> 'array' or jsonb_typeof(payloads) <> 'object' then
    return false;
  end if;
  if jsonb_array_length(metadata) > 10 or octet_length(payloads::text) > 4194600 then
    return false;
  end if;

  for file in select value from jsonb_array_elements(metadata) loop
    file_id := file->>'id';
    if jsonb_typeof(file) <> 'object'
      or jsonb_typeof(file->'id') is distinct from 'string'
      or file_id !~ '^f[1-9][0-9]{0,5}$' or file_id = any(seen)
      or jsonb_typeof(file->'name') is distinct from 'string'
      or char_length(file->>'name') not between 1 and 180
      or (file ? 'imageType' and (file->>'imageType' is null
        or file->>'imageType' not in ('image/png', 'image/jpeg', 'image/webp')))
      or (file - array['id', 'name', 'imageType']) <> '{}'::jsonb
      or jsonb_typeof(payloads->file_id) is distinct from 'string' then
      return false;
    end if;

    payload := payloads->>file_id;
    if payload = '' then return false; end if;
    if payload ~ '[^A-Za-z0-9+/=]' then return false; end if;
    total := total + octet_length(decode(payload, 'base64'));
    if total > 3145728 then return false; end if;
    seen := array_append(seen, file_id);
  end loop;
  return payloads - seen = '{}'::jsonb;
exception when data_exception then
  return false;
end;
$$;

revoke all on function private.fornexa_valid_ticket_attachments(jsonb, jsonb) from public, anon;
grant execute on function private.fornexa_valid_ticket_attachments(jsonb, jsonb) to authenticated;

alter table public.user_tickets
  add column attachments jsonb not null default '[]'::jsonb,
  add column attachment_payloads jsonb not null default '{}'::jsonb,
  add constraint user_tickets_valid_attachments
    check (private.fornexa_valid_ticket_attachments(attachments, attachment_payloads));

grant insert (attachments, attachment_payloads) on public.user_tickets to authenticated;

insert into public.fornexa_schema_migrations (version, description)
values ('20261126090600', 'Multiple user ticket attachments and inline screenshots');

commit;
