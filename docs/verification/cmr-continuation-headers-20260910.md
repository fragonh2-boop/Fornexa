# CMR continuation headers — Chromium verification

Fecha: 10/09/2026

## Objetivo

Verificar en un motor Chromium real la premisa de impresión usada por la mejora de continuidad multipágina del CMR: una tabla de mercancías con `thead { display: table-header-group }` debe repetir en cada hoja tanto la identidad del documento como los encabezados de las casillas 6–12.

Esta evidencia es un **harness sintético aislado** del bloque de mercancías. No es un E2E autenticado de un CMR productivo y no usa datos de cliente.

## Entorno

- Chromium del entorno: `/usr/bin/chromium`.
- Automatización: Playwright Python.
- Emulación: media `print`.
- PDF: A4 portrait, `prefer_css_page_size=true`, sin cabecera/footer del navegador.
- CSS del harness reproduce las reglas de impresión introducidas para `.goods`, `.goodsIdentity`, `.goodsHead` y `.goodsRow`.

## Fixture

- CMR sintético: `TEST-CONT-001`.
- 42 líneas de mercancía identificadas como `MK-1` … `MK-42`.
- Siete columnas equivalentes a las casillas CMR 6–12.
- Altura de fila de 10 mm para forzar continuación a una segunda hoja.

## Resultado

- PDF generado: **2 páginas A4**.
- Página 1: aparece una vez `CMR TEST-CONT-001 · MERCANCÍAS` y una vez el encabezado `6 Marcas y números` junto con el resto de columnas.
- Página 2: vuelve a aparecer una vez `CMR TEST-CONT-001 · MERCANCÍAS` y vuelve a aparecer una vez el encabezado `6 Marcas y números` junto con el resto de columnas.
- Extracción de texto: **42/42 marcadores de mercancía presentes**, desde `MK-1` hasta `MK-42`, sin ausencias.
- Distribución observada por extracción: filas 1–23 en página 1 y 24–42 en página 2.

## Alcance y límite

La prueba confirma el comportamiento de repetición de `thead` y preservación de filas en Chromium para el patrón de tabla empleado. No valida por sí sola el CMR completo detrás de autenticación, ni resuelve el marco exterior por página; ese marco sigue siendo una mejora visual separada.

## Veredicto

La solución de tabla semántica es apta para pasar a Preview/CI: la identidad CMR y los encabezados de mercancías se repiten automáticamente cuando el bloque 6–12 pagina, sin introducir overlays ni recorte de filas.
