-- Traceability screen (/dashboard/trazabilidad): reverse lookups from an article
-- to the records that carried it. Read paths only; no data is changed.
create index if not exists delivery_note_lines_order_line_idx on public.delivery_note_lines (order_line_id);
create index if not exists expedition_delivery_notes_note_idx on public.expedition_delivery_notes (delivery_note_id);
create index if not exists trip_expeditions_expedition_idx on public.trip_expeditions (expedition_id);
create index if not exists trip_stop_delivery_notes_note_idx on public.trip_stop_delivery_notes (delivery_note_id);
create index if not exists order_lines_tenant_sku_lower_idx on public.order_lines (tenant_id, lower(sku));
create index if not exists inventory_movements_tenant_batch_idx on public.inventory_movements (tenant_id, batch_number) where batch_number is not null;
create index if not exists inventory_movements_tenant_serial_idx on public.inventory_movements (tenant_id, serial_number) where serial_number is not null;
