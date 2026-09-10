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

El script falla si cambia el número de páginas esperado de los fixtures controlados, falta cualquier `MK-n`, una página con mercancía no repite identidad/encabezados o aparece una página completamente vacía. Las comparaciones de texto se hacen sin depender de mayúsculas/minúsculas para no acoplar el resultado a cómo Chromium exponga `text-transform` en la capa de texto PDF.

## Entorno observado

- Chromium: **144.0.7559.96**, Debian GNU/Linux 13.
- Binario: `/usr/bin/chromium`.
- Media: `print`.
- PDF: A4 portrait, CSS page size, sin cabecera/footer del navegador.
- Documento: 192 mm dentro de A4 con margen de 9 mm.
- Filas: `break-inside: avoid` / `page-break-inside: avoid`.
- Cabecera de mercancías: `thead` como `table-header-group`.

Los SHA-256 indicados abajo identifican únicamente los PDFs de la ejecución observada el 10/09/2026. Son **informativos, no criterios de pass/fail ni hashes deterministas**: pueden variar con versión de Chromium, fuentes o metadatos sin que exista una regresión.

## Fixtures y resultados

### Caso normal sintético

- 2 líneas de mercancía.
- Resultado: **1 página A4**.
- `MK-1` y `MK-2` presentes.
- SHA-256 informativo: `57a27cb34f1130a8000e120956a0dcac77fa74b58cc01b97b38b26fde539c102`.

Este resultado demuestra una sola hoja **solo para el fixture sintético**. No afirma que todo CMR real/autenticado con contenido de longitud arbitraria permanezca en una sola página; esa comprobación requiere una sesión/dato real de Preview.

### 42 líneas

- Resultado: **3 páginas A4**.
- Distribución: p1 `MK-1…14`; p2 `MK-15…37`; p3 `MK-38…42`.
- **42/42** marcadores conservados.
- Toda página con mercancía repite identidad CMR + encabezados 6–12.
- SHA-256 informativo: `684c599831cb0e20e2278c7af78ed4c34634104e67f007e7c8cdff2fd06e65a6`.

### 42 líneas con descripción excepcionalmente larga

- Resultado: **3 páginas A4**, sin hoja vacía.
- Distribución: p1 `MK-1…14`; p2 `MK-15…35`; p3 `MK-36…42`.
- **42/42** marcadores conservados.
- La fila larga permanece íntegra y no provoca pérdida de datos ni página vacía.
- SHA-256 informativo: `31a802b5c5d4147cecf23593b2a54209991fc722f0d4e996ca8913d0688c4d6b`.

### 80 líneas

- Resultado: **5 páginas A4**.
- Distribución: p1 `MK-1…14`; p2 `MK-15…37`; p3 `MK-38…60`; p4 `MK-61…80`; p5 contiene únicamente bloques finales.
- **80/80** marcadores conservados.
- Páginas 1–4 repiten identidad + encabezados; p5 no repite el `thead` porque ya no contiene mercancía.
- Sin páginas vacías.
- SHA-256 informativo: `1f712cf4f57e2d2129d01d301ef3effb61eeb790705ef491bb5e132057de792e`.

## Alcance y límites

La prueba confirma en Chromium la repetición de `thead`, preservación de filas, ausencia de páginas vacías en los casos controlados y resistencia a una fila larga y a 80 líneas. Los tests Node de `tests/cmr-print-qr-readiness.test.ts` son **guardas de contrato sobre fuente**, no pruebas de comportamiento del navegador.

No sustituye un E2E autenticado contra la ruta real de un CMR ni prueba el caso normal con datos reales de Preview. Tampoco resuelve el marco exterior físico por página; ese acabado sigue fuera del alcance de PR #66.

## Veredicto

El mecanismo de tabla semántica pagina de forma controlada en los fixtures verificados y repite identidad CMR + encabezados 6–12 en cada hoja que contiene mercancía, sin pérdida de líneas ni páginas vacías en esos casos. La promoción a producción sigue condicionada a CI/Preview y revisión exact-HEAD.
