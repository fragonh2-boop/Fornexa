# DeCA P0-A — lifecycle de URL pública

## Fuente regulatoria

Resolución de 5 de junio de 2026 de la Dirección General de Transporte por Carretera y Ferrocarril, BOE-A-2026-12784, publicada el 12 de junio de 2026.

Apartado tercero:

- la URL no puede expirar antes de la finalización del servicio;
- durante el servicio debe permitir la descarga directa del PDF;
- transcurridos siete días naturales tras la finalización del servicio, se podrá desactivar la descarga.

Fuente oficial: https://www.boe.es/eli/es/res/2026/06/05/(2)/con

## Invariante FORNEXA

Cuando `service_completed_at` esté informado:

- `public_until >= service_completed_at + 7 días naturales`;
- la URL sigue siendo válida mientras `now <= public_until`;
- una ventana superior a siete días es válida;
- una ventana inferior al mínimo se trata como configuración inválida y falla de forma cerrada;
- `deactivated_at` sigue invalidando el acceso de forma explícita;
- la conservación del PDF regulatorio durante al menos un año es independiente del lifecycle de la URL pública.

## Alcance P0-A

El cambio modifica únicamente el lifecycle de la URL pública DeCA. No relaja ni cambia:

- token opaco y persistencia exclusiva de SHA-256;
- aislamiento por tenant;
- bucket privado y PDF-only;
- validación de tamaño e integridad del PDF;
- descarga directa sin autenticación interactiva;
- `Content-Disposition` y cabeceras de privacidad;
- conservación documental.

## Gate de promoción

Antes de producción deben quedar verdes tests, typecheck, lint, build, CI, Preview Vercel y validación de la migración Supabase. La migración no debe aplicarse manualmente en producción fuera del flujo de promoción revisado.
