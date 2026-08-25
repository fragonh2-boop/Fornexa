alter table public.parties drop constraint if exists parties_status_check;
alter table public.parties add constraint parties_status_check check (status = any (array['ACTIVE'::text, 'REVIEW'::text, 'INACTIVE'::text, 'BLOCKED'::text]));
