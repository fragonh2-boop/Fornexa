begin;

-- Cobertura territorial importada por error como servicio. La comprobación
-- previa confirma que no tiene pedidos ni expedientes asociados.
delete from public.party_services
where service_id in (
  select id
  from public.service_catalog
  where code = 'SRV-FR-69800'
    and service_type = 'LEGACY'
    and metadata ->> 'source' = 'localStorage assignment'
);

delete from public.service_catalog
where code = 'SRV-FR-69800'
  and service_type = 'LEGACY'
  and metadata ->> 'source' = 'localStorage assignment';

commit;
