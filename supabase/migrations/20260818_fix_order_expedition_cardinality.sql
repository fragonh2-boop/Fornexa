-- Corrige la cardinalidad operativa al modelo canónico documentado:
-- Pedido 1:N Albaranes; Albarán 1:1 Expediente; por tanto Pedido 1:N Expedientes.
--
-- La migración 20260817_expeditions_order_id_unique hizo único expeditions.order_id,
-- forzando accidentalmente Pedido 1:1 Expediente. Conservamos order_id como vínculo
-- denormalizado útil y el trigger de consistencia, pero la unicidad pertenece al albarán.

drop index if exists public.expeditions_order_id_unique_idx;

create index if not exists expeditions_order_idx
  on public.expeditions(order_id);

create unique index if not exists expedition_delivery_notes_delivery_note_unique_idx
  on public.expedition_delivery_notes(delivery_note_id);

comment on column public.expeditions.order_id is
  'Pedido de origen. Un pedido puede originar varios expedientes a través de sus albaranes; todos los albaranes vinculados a este expediente deben pertenecer al mismo pedido.';

comment on table public.expedition_delivery_notes is
  'Vínculo Albarán 1:1 Expediente. Un expediente pertenece a un pedido y puede agrupar los albaranes de ese pedido según el flujo operativo; cada albarán solo puede pertenecer a un expediente.';

insert into public.fornexa_schema_migrations (version, description)
values (
  '20260818_fix_order_expedition_cardinality',
  'restore canonical Pedido 1:N Expedientes via Albaran 1:1 Expediente; remove erroneous unique expeditions.order_id'
)
on conflict (version) do nothing;
