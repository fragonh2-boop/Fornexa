-- Fuerza la cardinalidad real Pedido 1:1 Expediente (antes solo era una FK sin unicidad).
-- Parcial (WHERE order_id IS NOT NULL) porque la columna es nullable: permite expedientes
-- sin pedido asociado todavia, pero nunca dos expedientes para el mismo pedido.
create unique index if not exists expeditions_order_id_unique_idx
  on public.expeditions(order_id)
  where order_id is not null;

insert into public.fornexa_schema_migrations (version, description)
values ('20260817_expeditions_order_id_unique', 'enforce true 1:1 order<->expedition with partial unique index')
on conflict (version) do nothing;
