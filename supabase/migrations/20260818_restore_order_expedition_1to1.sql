-- Revierte 20260818_fix_order_expedition_cardinality.sql (aplicada fuera del sistema de
-- tracking de Supabase por un runner ad-hoc, sin registro en fornexa_schema_migrations).
--
-- Confirmado explicitamente por el usuario (2026-08-18): "1 pedido no puede estar en
-- diferentes expedientes". La cardinalidad correcta es Pedido 1:1 Expediente.
-- Los distintos albaranes (recogidas separadas) de un mismo pedido consolidan en ESE
-- unico expediente; por tanto la unicidad pertenece a expeditions.order_id, no a
-- expedition_delivery_notes.delivery_note_id.

drop index if exists public.expedition_delivery_notes_delivery_note_unique_idx;

create unique index if not exists expeditions_order_id_unique_idx
  on public.expeditions(order_id)
  where order_id is not null;

comment on column public.expeditions.order_id is
  'Pedido de origen. Un pedido va a exactamente un expediente (1:1); sus albaranes (recogidas separadas) consolidan aqui. Confirmado por el usuario 2026-08-18.';

comment on table public.expedition_delivery_notes is
  'Consolidacion de albaranes en un expediente. Un albaran pertenece a un expediente; ese expediente pertenece a exactamente un pedido, y ese pedido no puede tener otro expediente.';

insert into public.fornexa_schema_migrations (version, description)
values (
  '20260818_restore_order_expedition_1to1',
  'revert erroneous 20260818_fix_order_expedition_cardinality: restore canonical Pedido 1:1 Expediente per explicit user confirmation'
)
on conflict (version) do nothing;
