begin;

create index if not exists hazmat_editions_approved_by_idx on public.hazmat_editions(approved_by);
create index if not exists hazmat_synonyms_tenant_idx on public.hazmat_entry_synonyms(tenant_id);
create index if not exists hazmat_synonyms_verified_by_idx on public.hazmat_entry_synonyms(verified_by);
create index if not exists hazmat_entry_packaging_type_idx on public.hazmat_entry_packaging_options(packaging_type_id);

create index if not exists party_adr_profiles_tenant_idx on public.party_adr_profiles(tenant_id);
create index if not exists party_adr_profiles_updated_by_idx on public.party_adr_profiles(updated_by);
create index if not exists products_customer_idx on public.products(customer_id);

create index if not exists product_hazmat_tenant_idx on public.product_hazmat_assignments(tenant_id);
create index if not exists product_hazmat_entry_idx on public.product_hazmat_assignments(hazmat_entry_id);
create index if not exists product_hazmat_edition_idx on public.product_hazmat_assignments(edition_id);
create index if not exists product_hazmat_order_line_idx on public.product_hazmat_assignments(remembered_from_order_line_id);
create index if not exists product_hazmat_approved_by_idx on public.product_hazmat_assignments(approved_by);

create index if not exists order_line_hazmat_tenant_idx on public.order_line_hazmat(tenant_id);
create index if not exists order_line_hazmat_entry_idx on public.order_line_hazmat(hazmat_entry_id);
create index if not exists order_line_hazmat_edition_idx on public.order_line_hazmat(edition_id);
create index if not exists order_line_hazmat_packaging_idx on public.order_line_hazmat(packaging_type_id);

create index if not exists order_hazmat_order_idx on public.order_hazmat_assessments(order_id);
create index if not exists order_hazmat_edition_idx on public.order_hazmat_assessments(edition_id);
create index if not exists order_hazmat_assessed_by_idx on public.order_hazmat_assessments(assessed_by);

create index if not exists trip_hazmat_trip_idx on public.trip_hazmat_assessments(trip_id);
create index if not exists trip_hazmat_stop_idx on public.trip_hazmat_assessments(trip_stop_id);
create index if not exists trip_hazmat_edition_idx on public.trip_hazmat_assessments(edition_id);

create index if not exists entity_revisions_supersedes_idx on public.entity_revisions(supersedes_revision_id);
create index if not exists entity_revisions_created_by_idx on public.entity_revisions(created_by);
create index if not exists device_revision_dispatches_tenant_idx on public.device_revision_dispatches(tenant_id);
create index if not exists audit_events_actor_idx on public.audit_events(actor_user_id);
create index if not exists cmr_goods_lines_source_order_line_idx on public.cmr_goods_lines(source_order_line_id);

insert into public.fornexa_schema_migrations (version, description)
values ('20260822231225_adr_foundation_indexes', 'Índices de integridad referencial del núcleo ADR')
on conflict (version) do nothing;

commit;
