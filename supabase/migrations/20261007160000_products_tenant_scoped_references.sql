-- Tenant-scoped references to the product master.
--
-- Every table that points at public.products already carries a NOT NULL
-- tenant_id, but the foreign keys only checked products(id). A row could
-- therefore reference a product owned by another tenant. Composite foreign
-- keys make that impossible at database level (same pattern as the tariff
-- engine). Verified before writing: products and the five referencing tables
-- hold 0 rows in production (2026-10-07), so no data is revalidated.
--
-- products keeps deny-by-default for client writes: authenticated users only
-- have the SELECT policy and all writes go through server routes that check
-- role and tenant. This is intentional and documented below.

create unique index if not exists products_tenant_id_id_key on public.products(tenant_id, id);

alter table public.order_lines drop constraint if exists order_lines_product_id_fkey;
alter table public.order_lines add constraint order_lines_product_tenant_fk
  foreign key (tenant_id, product_id) references public.products(tenant_id, id) on delete restrict;

alter table public.product_packagings drop constraint if exists product_packagings_product_id_fkey;
alter table public.product_packagings add constraint product_packagings_product_tenant_fk
  foreign key (tenant_id, product_id) references public.products(tenant_id, id) on delete cascade;

alter table public.product_hazmat_assignments drop constraint if exists product_hazmat_assignments_product_id_fkey;
alter table public.product_hazmat_assignments add constraint product_hazmat_assignments_product_tenant_fk
  foreign key (tenant_id, product_id) references public.products(tenant_id, id) on delete cascade;

alter table public.inventory_quants drop constraint if exists inventory_quants_product_id_fkey;
alter table public.inventory_quants add constraint inventory_quants_product_tenant_fk
  foreign key (tenant_id, product_id) references public.products(tenant_id, id) on delete restrict;

alter table public.inventory_movements drop constraint if exists inventory_movements_product_id_fkey;
alter table public.inventory_movements add constraint inventory_movements_product_tenant_fk
  foreign key (tenant_id, product_id) references public.products(tenant_id, id) on delete restrict;

comment on table public.products is
  'Product master. Client roles have SELECT only (tenant_read); writes are server-side through /api/products and /api/orders, which enforce tenant and role.';
