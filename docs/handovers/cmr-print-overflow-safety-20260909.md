# CMR print overflow safety — 2026-09-09

## Objetivo

Cerrar el riesgo de integridad documental detectado después de PR #60: un CMR con datos largos podía quedar recortado silenciosamente por `height/max-height: 279mm` junto con `overflow: hidden`.

## Cambio preparado

- Se conserva A4 portrait con margen de 9 mm y ancho útil de 192 mm.
- 279 mm pasa a ser altura mínima de la primera hoja, no un máximo que recorte contenido.
- `height: auto`, `max-height: none` y `overflow: visible` permiten paginación cuando el contenido real no cabe en una sola hoja.
- Cabecera, filas de mercancía, ADR, firmas y footer evitan partirse internamente cuando el motor de impresión puede respetarlo.
- No cambia ningún dato, firma, QR, API, DB, permiso ni regla regulatoria.

## Gates

- CI y Preview del HEAD exacto.
- Revisión independiente Claude/DeepSeek sin MUST.
- Comprobación visual con nombres/direcciones largos y varias líneas de mercancía antes de declarar cierre productivo.

## Estado

Preproducción. No fusionado ni desplegado todavía.
