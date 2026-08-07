# Fornexa Customs Spain

Base segura para integrar Fornexa con los servicios SOAP/XML de Aduanas de la AEAT.

## Principios

- Modo `mock` por defecto.
- Producción bloqueada salvo `AEAT_TRANSMISSION_ENABLED=true`.
- Endpoints inyectados como secretos; nunca codificados en el repositorio.
- Certificados únicamente en el servidor.
- Conservación íntegra de solicitudes, respuestas, correlación y versiones.
- Un adaptador por sistema y versión de guía.

## Variables

`AEAT_ENVIRONMENT=mock|preproduction|production`

`AEAT_TRANSMISSION_ENABLED=false`

`AEAT_CERTIFICATE_PFX_BASE64`, `AEAT_CERTIFICATE_PASSPHRASE` o alternativamente `AEAT_CERTIFICATE_PEM`, `AEAT_PRIVATE_KEY_PEM`.

Endpoints: `AEAT_H1_ENDPOINT`, `AEAT_H7_ENDPOINT`, `AEAT_AES_ENDPOINT`, `AEAT_NCTS6_ENDPOINT`, `AEAT_G3_ENDPOINT`, `AEAT_G4_ENDPOINT`, `AEAT_G5_ENDPOINT`, `AEAT_EXS_ENDPOINT`, `AEAT_POUS_ENDPOINT`, `AEAT_DOCUMENTS_ENDPOINT`.

## Activación

1. Aplicar la migración de Supabase y crear políticas RLS por `tenant_id`.
2. Cargar certificado y endpoints oficiales del entorno de pruebas.
3. Implementar cada mapper XML desde el WSDL/XSD vigente y fijar su versión.
4. Ejecutar casos de conformidad en preproducción.
5. Validar EORI, representación, garantías y autorizaciones.
6. Aprobar el paso a producción y activar la transmisión.

## API interna

- `GET /api/customs/health`: matriz de preparación sin revelar secretos.
- `POST /api/customs/messages`: valida y simula en modo mock; transmite únicamente tras activación segura.

La API no sustituye las reglas de negocio de cada declaración. Los mappers H1, AES y NCTS6 deben generarse y probarse contra las guías oficiales antes de cualquier envío real.
