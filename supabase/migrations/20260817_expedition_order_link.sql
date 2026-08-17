-- Pedido 1:1 Expediente. Los distintos albaranes de un pedido (recogidas separadas)
-- consolidan en ese unico expediente via expedition_delivery_notes.
alter table public.expeditions
  add column if not exists order_id uuid references public.orders(id) on delete restrict;

create index if not exists expeditions_order_idx on public.expeditions(order_id);

comment on column public.expeditions.order_id is
  'Pedido de origen. Un pedido va a exactamente un expediente; sus albaranes (recogidas separadas) consolidan aqui.';

-- Consistencia: todo albaran consolidado en un expediente debe pertenecer al mismo pedido del expediente.
create or replace function public.fornexa_check_expedition_delivery_note_order()
returns trigger
language plpgsql
as $$
declare
  v_expedition_order_id uuid;
  v_delivery_note_order_id uuid;
begin
  select order_id into v_expedition_order_id from public.expeditions where id = new.expedition_id;
  select order_id into v_delivery_note_order_id from public.delivery_notes where id = new.delivery_note_id;

  if v_expedition_order_id is not null
     and v_delivery_note_order_id is not null
     and v_expedition_order_id <> v_delivery_note_order_id then
    raise exception 'El albaran % pertenece a un pedido distinto del expediente %', new.delivery_note_id, new.expedition_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_expedition_delivery_note_order on public.expedition_delivery_notes;
create trigger trg_check_expedition_delivery_note_order
  before insert or update on public.expedition_delivery_notes
  for each row execute function public.fornexa_check_expedition_delivery_note_order();

insert into public.fornexa_schema_migrations (version, description)
values ('20260817_expedition_order_link', 'expeditions.order_id + consistency trigger')
on conflict (version) do nothing;
