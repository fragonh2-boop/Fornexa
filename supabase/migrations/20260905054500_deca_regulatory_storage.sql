begin;

-- DeCA-2: private PDF storage for immutable regulatory artifacts.
-- The public route resolves FORNEXA token hashes server-side and never exposes
-- a public Storage bucket or a durable Storage URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'regulatory-documents',
  'regulatory-documents',
  false,
  5242880,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.fornexa_schema_migrations (version, description)
values (
  '20260905054500_deca_regulatory_storage',
  'DeCA-2 private regulatory PDF bucket with 5MB and application/pdf restrictions'
)
on conflict (version) do nothing;

commit;
