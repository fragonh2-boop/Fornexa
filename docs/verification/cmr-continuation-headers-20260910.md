# CMR continuation headers — Chromium verification

Fecha: 10/09/2026

## Objetivo

Verificar en un motor Chromium real la mejora de continuidad multipágina del CMR: una tabla de mercancías con `thead { display: table-header-group }` debe repetir en cada hoja que contiene mercancías tanto la identidad del documento como los encabezados de las casillas 6–12, sin volver a introducir clipping ni romper el caso normal de una sola hoja.

Esta evidencia usa **fixtures sintéticos sin datos de cliente**. No es un E2E autenticado contra un CMR productivo. El harness completo reproduce la estructura de secciones relevante del documento (`paperHeader`, bloques superiores, mercancías, ADR, bloques finales, firmas y footer) y el contrato CSS de impresión de esas superficies.

## Reproducibilidad

El script queda versionado en:

`scripts/verify-cmr-continuation-print.py`

Requisitos del entorno:

- Chromium (`/usr/bin/chromium` por defecto);
- Playwright Python;
- `pypdf` para inspeccionar el PDF resultante.

Ejemplo:

```bash
python scripts/verify-cmr-continuation-print.py --out-dir /tmp/fornexa-cmr-print
```

El script genera los PDFs, extrae su texto y falla si:

- cambia el número de páginas esperado para los fixtures controlados;
- falta cualquier marcador `MK-n`;
- una página que contiene mercancía no repite la identidad CMR o los encabezados 6–12;
- aparece una página PDF completamente vacía.

## Entorno de la verificación

- Chromium del entorno: `/usr/bin/chromium`.
- Automatización: Playwright Python.
- Emulación: media `print`.
- PDF: A4 portrait, CSS page size, sin cabecera/footer del navegador.
- Ancho documental: 192 mm dentro de A4 con margen de 9 mm.
- Filas de mercancía: `break-inside: avoid` / `page-break-inside: avoid`.
- Cabecera de mercancías: `thead` como `table-header-group`.

## Fixtures y resultados

### Caso normal

- 2 líneas de mercancía.
- Resultado: **1 página A4**.
- Mercancías presentes: `MK-1` y `MK-2`.
- SHA-256 del PDF observado: `57a27cb34f1130a8000e120956a0dcac77fa74b58cc01b97b38b26fde539c102`.

Confirma que convertir el bloque 6–12 a tabla no fuerza una segunda página cuando el contenido cabe.

### 42 líneas

- 42 líneas uniformes.
- Resultado: **3 páginas A4** en el fixture completo.
- Distribución de marcadores: página 1 `MK-1…14`; página 2 `MK-15…37`; página 3 `MK-38…42`.
- **42/42 marcadores conservados**.
- Todas las páginas que contienen mercancía repiten identidad CMR + encabezados 6–12.
- SHA-256: `684c599831cb0e20e2278c7af78ed4c34634104e67f007e7c8cdff2fd06e65a6`.

La diferencia respecto al harness inicial aislado de 2 páginas es intencionada: el fixture completo incorpora los bloques superiores/finales, firmas y footer, por lo que reproduce mejor el reparto vertical del CMR.

### 42 líneas con una descripción excepcionalmente larga

- 42 líneas; una fila central contiene una descripción larga que obliga a crecer a la fila.
- Resultado: **3 páginas A4**, sin página en blanco.
- Distribución: página 1 `MK-1…14`; página 2 `MK-15…35`; página 3 `MK-36…42`.
- **42/42 marcadores conservados**.
- La fila larga permanece íntegra por `break-inside: avoid` y no provoca pérdida de datos ni hoja vacía.
- SHA-256: `31a802b5c5d4147cecf23593b2a54209991fc722f0d4e996ca8913d0688c4d6b`.

### 80 líneas

- 80 líneas uniformes.
- Resultado: **5 páginas A4**.
- Distribución: página 1 `MK-1…14`; página 2 `MK-15…37`; página 3 `MK-38…60`; página 4 `MK-61…80`; página 5 contiene únicamente los bloques finales del documento.
- **80/80 marcadores conservados**.
- Las páginas 1–4, que contienen mercancía, repiten identidad CMR + encabezados 6–12.
- La página 5 no repite la cabecera de mercancías porque ya no contiene la tabla, que es el comportamiento esperado.
- No aparece ninguna página vacía.
- SHA-256: `1f712cf4f57e2d2129d01d301ef3effb61eeb790705ef491bb5e132057de792e`.

## Alcance y límites

La prueba confirma en Chromium la repetición real de `thead`, la preservación de filas, la ausencia de páginas vacías en los casos controlados y que el CMR sintético normal sigue ocupando una única hoja. También ejercita el riesgo señalado por revisión independiente de una fila que crece por contenido largo y un documento de 80 líneas.

No sustituye un E2E autenticado contra la ruta real de un CMR de producción y no resuelve el marco exterior físico por página. Ese marco sigue fuera del alcance de PR #66.

Los tests Node de `tests/cmr-print-qr-readiness.test.ts` son **guardas de contrato sobre fuente**, no prueba de comportamiento de navegador. La evidencia de comportamiento es este harness Chromium reproducible.

## Veredicto

La solución de tabla semántica mantiene el caso normal de una sola página y pagina de forma controlada en casos extensos. En todas las hojas que contienen mercancía se repiten automáticamente la identidad CMR y los encabezados 6–12, sin pérdida de líneas ni páginas vacías en los fixtures verificados.
