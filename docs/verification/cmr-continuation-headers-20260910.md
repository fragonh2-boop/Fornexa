# CMR continuation headers — Chromium verification

Fecha: 10/09/2026

## Objetivo

Verificar en Chromium la mejora de continuidad multipágina del CMR: la tabla de mercancías con `thead { display: table-header-group }` debe repetir en cada hoja que contiene mercancías la identidad del documento y los encabezados 6–12, sin reintroducir clipping.

Esta es **evidencia manual reproducible con fixtures sintéticos**, no un job de CI ni un E2E autenticado contra un CMR productivo. No usa datos de cliente. El fixture reproduce la estructura relevante: cabecera, bloques superiores, mercancías, ADR, bloques finales, firmas y footer.

## Reproducibilidad

Script versionado:

`scripts/verify-cmr-continuation-print.py`

Ejemplo:

```bash
python scripts/verify-cmr-continuation-print.py --out-dir /tmp/fornexa-cmr-print
```

Requisitos: Chromium, Playwright Python y `pypdf`.

El harness valida invariantes de impresión, no un número rígido de páginas para documentos extensos: exige exactamente una página al fixture normal, multipágina para los fixtures extensos, conservación de todos los `MK-n`, identidad/encabezados en toda página con mercancía y ausencia de páginas completamente vacías. Las comparaciones de texto son case-insensitive para no depender de cómo Chromium exponga `text-transform` en la capa PDF.

## Entorno y ejecución observada

El harness endurecido se ejecutó manualmente el 10/09/2026 después de incorporar la comparación case-insensitive y el criterio por invariantes.

- Chromium: **144.0.7559.96**, Debian GNU/Linux 13.
- Binario: `/usr/bin/chromium`.
- Media: `print`.
- PDF: A4 portrait, CSS page size, sin cabecera/footer del navegador.
- Documento: 192 mm dentro de A4 con margen de 9 mm.
- Filas: `break-inside: avoid` / `page-break-inside: avoid`.
- Cabecera de mercancías: `thead` como `table-header-group`.

Los SHA-256 siguientes identifican únicamente los PDFs de esta ejecución. Son **informativos, no criterios de pass/fail ni hashes deterministas**: pueden variar con Chromium, fuentes o metadatos sin que exista una regresión.

## Fixtures y resultados

### Caso normal sintético

- 2 líneas de mercancía.
- Resultado: **1 página A4**.
- Distribución: p1 `MK-1…2`.
- Identidad y encabezados presentes.
- SHA-256 informativo: `bb5713a146ba6cb9af98ba6027a0fcefa9a8c78b4be18cf94b0ed1bd313882a6`.

Este resultado demuestra una sola hoja **solo para el fixture sintético**. No afirma que todo CMR real/autenticado con contenido de longitud arbitraria permanezca en una sola página; esa comprobación requiere un CMR real de Preview accesible con sesión legítima.

### 42 líneas

- Resultado observado: **3 páginas A4**.
- Mercancías: p1 `MK-1…17`; p2 `MK-18…42`; p3 contiene bloques finales, sin mercancías.
- **42/42** marcadores conservados.
- Páginas 1–2 repiten identidad CMR + encabezados 6–12; p3 correctamente no repite el `thead`.
- SHA-256 informativo: `a148d947adfd5b6ac6068b693eb60345f3d3a9dff5df3dc44fe0722170292fc4`.

### 42 líneas con descripción excepcionalmente larga

- Resultado observado: **3 páginas A4**, sin hoja vacía.
- Mercancías: p1 `MK-1…17`; p2 `MK-18…38`; p3 `MK-39…42`.
- **42/42** marcadores conservados.
- Las tres páginas con mercancía repiten identidad + encabezados.
- La fila larga permanece íntegra y no provoca pérdida de datos ni página vacía.
- SHA-256 informativo: `5617ff8d669d8f0956b2e016a15d188a5b28c784eab65e9d260411f02b037913`.

### 80 líneas

- Resultado observado: **4 páginas A4**.
- Mercancías: p1 `MK-1…17`; p2 `MK-18…44`; p3 `MK-45…71`; p4 `MK-72…80`.
- **80/80** marcadores conservados.
- Las cuatro páginas repiten identidad CMR + encabezados 6–12.
- Sin páginas vacías.
- SHA-256 informativo: `c7ce02f65ca5c224dee85c49e28be32fe925e3d57693c9224b2185e4ba2dd2a0`.

La paginación exacta de documentos extensos no forma parte del contrato: puede variar por versión de Chromium, fuentes o contenido. El contrato es preservar el documento, evitar hojas vacías patológicas y repetir el `thead` en cada página que continúe mercancías.

## Alcance y límites

La prueba confirma en Chromium la repetición de `thead`, preservación de filas, ausencia de páginas vacías en los casos controlados y resistencia a una fila larga y a 80 líneas. Los tests Node de `tests/cmr-print-qr-readiness.test.ts` son **guardas de contrato sobre fuente**, no pruebas de comportamiento del navegador.

No sustituye un E2E autenticado contra la ruta real de un CMR ni prueba el caso normal con datos reales de Preview. Tampoco resuelve el marco exterior físico por página; ese acabado sigue fuera del alcance de PR #66.

## Veredicto

El harness endurecido pasa en Chromium 144.0.7559.96: el fixture normal conserva una hoja; los casos extensos paginan, preservan todas las líneas y repiten identidad CMR + encabezados 6–12 en cada hoja que contiene mercancía, sin páginas vacías. La promoción a producción sigue condicionada a CI/Preview y revisión exact-HEAD.
