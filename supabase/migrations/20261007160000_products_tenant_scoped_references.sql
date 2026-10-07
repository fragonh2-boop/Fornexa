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

-- Exactly five foreign keys reference public.products in production (checked in
-- pg_constraint on 2026-10-07): order_lines, product_packagings,
-- product_hazmat_assignments, inventory_quants and inventory_movements. Together
-- with products itself these are the six tables verified empty.
--
-- Precondition: abort with an actionable message if any existing row would
-- violate the new tenant-scoped keys, instead of failing inside ADD CONSTRAINT.
do $precheck$
declare
  orphan_count bigint;
  ref record;
begin
  for ref in select unnest(array['order_lines','product_packagings','product_hazmat_assignments','inventory_quants','inventory_movements']) as table_name loop
    execute format(
      'select count(*) from public.%I t where t.product_id is not null and not exists (select 1 from public.products p where p.id = t.product_id and p.tenant_id = t.tenant_id)',
      ref.table_name
    ) into orphan_count;
    if orphan_count > 0 then
      raise exception 'products tenant-scoped FK precheck: % row(s) in public.% reference a product of another tenant or a missing product', orphan_count, ref.table_name;
    end if;
  end loop;
end
$precheck$;

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
