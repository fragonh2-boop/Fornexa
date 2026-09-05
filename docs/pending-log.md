# FORNEXA — Pending log

Registro persistente de trabajo abierto. Verificar siempre contra GitHub, CI, Supabase y Vercel antes de actuar.

## OPEN

### 2026-09-05 — QR visible y listo antes de imprimir/exportar CMR
- **Área:** CMR / QR / Impresión-PDF / UX
- **Estado:** INTEGRADO Y DESPLEGADO; CI/CLAUDE/RPA DE PANTALLA VERDES; VALIDACIÓN NATIVA DE FRAN PENDIENTE
- **Evidencia productiva:** el detalle autenticado de `CMR-E2E-MOBILE-20260819` respondió 200, pero su endpoint QR respondió 401 porque la capability expiró el 22/08; el navegador mostró una imagen rota. Un CMR con capability vigente cargó el SVG correctamente.
- **Causa raíz:** la pantalla no esperaba `onLoad` del recurso QR antes de ejecutar `window.print()` y tampoco representaba explícitamente el rechazo 401.
- **Solución preparada:** impresión manual y automática bloqueadas hasta carga confirmada del QR exacto; error neutral visible y sin imagen rota, con reintento explícito para fallos transitorios. No se relaja expiración, revocación, tenant isolation ni exclusión de REVIEW.
- **Evidencia de revisión:** exact HEAD `6e9dcaa` pasó 82/82 tests, typecheck, lint sin errores (siete warnings existentes), build productivo, memorandum gate, `git diff --check`, GitHub CI y ambos checks Vercel. Claude confirmó el HEAD final sin MUST; solo dejó como NICE una duplicidad cosmética de cursor CSS.
- **Integración y producción:** PR #52 fusionada como `58513ba`; CI `33955972837` verde y deployment productivo canónico `READY` sobre ese SHA en `fornexasc.com`. Supabase Preview se omitió correctamente porque no hubo cambio de esquema.
- **RPA productiva:** un CMR vigente cargó QR real 150×150 y habilitó Imprimir/Exportar; una capability caducada mostró `QR no disponible`, ocultó la imagen rota, bloqueó ambas acciones y mantuvo el fallo controlado tras reintentar. Sin logs `error/fatal` observados en el deployment durante la prueba.
- **Criterio de cierre restante:** Fran valida visualmente el PDF/diálogo nativo con QR visible. La RPA de pantalla no sustituye esta aprobación explícita.

### 2026-09-05 — DeCA: cierre regulatorio y E2E del motor PDF/QR
- **Área:** Documentación regulatoria / CMR / Acceso público
- **Estado:** DECA-2 INTEGRADO, MIGRADO Y DESPLEGADO; CIERRE REGULATORIO/E2E PENDIENTE
- **Evidencia integrada:** PR #51 se fusionó en `f030f234`; CI `33946697109` y el deployment productivo canónico del mismo SHA terminaron `READY`. La lista de migraciones de producción contiene `20260905051522 deca_regulatory_storage`.
- **Base disponible:** bucket privado PDF-only de 5 MB, artefactos inmutables tenant-aware, token opaco guardado solo como SHA-256, QR a ruta FORNEXA y resolución pública fail-closed con comprobación de hash/tamaño.
- **Acción requerida:** realizar E2E controlado usando CMR no productivo/de prueba; completar motor PDF nativo, decisión M8, lifecycle operativo y eCMR.
- **Límites y riesgo:** no crear una segunda pila documental ni rerun de migraciones aplicadas. La marca temporal de la migración remota difiere del archivo versionado `20260905054500`; reconciliar bajo A2.
- **Criterio de cierre:** E2E documentado, revisión regulatoria/de seguridad aplicable y provenance A2 trazable; entonces promover el estado público desde Preproducción.

### 2026-09-04 — MMO-1 ejecución Preview controlada
- **Área:** IA / Orquestación / Seguridad
- **Estado:** BACKLOG — REQUIERE INTERVENCIÓN DE FRAN
- **Evidencia:** PR #38 draft, HEAD `865bee04f4581bb1d64cfd1fbe06941af8cee62a`, CI #187 verde, preview canónico READY y revisión Claude sin MUST.
- **Bloqueo:** configurar las siete variables server-side exclusivamente para Preview; Production debe permanecer sin flag activo ni claves de proveedores.
- **Después:** una ejecución sobre `public_code`, revisión de salida sanitizada, retirada de route/page/flag, nuevo CI/preview, revisión final y merge condicionado.

### 2026-09-01 — TLM-1 telemetría privada de plataforma
- **Área:** Plataforma / Observabilidad / Seguridad
- **Estado:** CANAL INTERNO; CONFIGURACIÓN Y VERIFICACIÓN FINAL PENDIENTES
- **Decisión:** analítica general de `fornexasc.com`, esquema separado, OWNER + allowlist server-side, sin DOM replay ni secretos en cliente.
- **Acción requerida:** configurar/verificar allowlist y hash secret, validar captura real y confirmar 404 para usuarios no autorizados.
- **Privacidad:** IP en claro 7 días; eventos/metadatos 90 días; sin contraseñas, tokens, payloads arbitrarios ni query strings.

### 2026-08-27 — Integración de ramas Supabase en estado fallido
- **Área:** Plataforma / CI / Supabase Preview
- **Estado:** PENDIENTE DE DIAGNÓSTICO Y CORRECCIÓN
- **Evidencia:** la comprobación Supabase Preview de `main` en `f030f234` sigue fallando, mientras que el workflow CI de GitHub del mismo SHA terminó verde. Producción está sana y registra `20260905051522 deca_regulatory_storage`, con timestamp distinto del archivo versionado DeCA-2.
- **Criterio de cierre:** preview Supabase con migración real aprobada y provenance A2 reconciliada, sin alterar ni rerun de producción.

### 2026-08-20 — Contraste de recuperación de contraseña
- **Área:** Auth / Login
- **Estado:** PENDIENTE
- **Acción requerida:** mejorar contraste del mensaje de confirmación y validar WCAG AA en escritorio y móvil.

## DONE

### 2026-09-04 — Regresión visual del logotipo de acceso
- **Estado:** PR #49 INTEGRADO Y VERIFICADO EN PRODUCCIÓN
- **Cierre:** Fran validó visualmente el Preview exacto; CI #191 terminó verde sobre `caea2d10f1ae0bc380cc404ae95f0c7c6c42d8c2`; PR #49 se fusionó por squash en `c450862f6262f8f3f864f2d744c20e0b1fb43b73`; el deployment productivo canónico `dpl_9HkCv3bVwypBSL3QkVtsV2GSDovH` quedó READY con alias `fornexasc.com`; `/login` responde 200 y sirve `viewBox="10 0 400 170"` con `overflow="visible"`; no hay logs runtime `error/fatal` del deployment.
- **Control permanente:** `docs/ux/UX_AUDIT_PROTOCOL.md` exige evidencia visual desplegada para cerrar cambios de layout, tipografía, SVG, responsive o impresión; CI/source tests protegen invariantes, pero no sustituyen la comprobación visual.

### 2026-09-03 — CMR interno, QR e impresión
- **Estado:** PRs #44–#47 integrados y verificados en producción.
- **Cierre:** acceso tenant-aware, QR interno seguro y exportación A4 sin chrome del dashboard.

### 2026-09-03 — DeCA-1 fundación documental
- **Estado:** IMPLEMENTADO, MIGRADO Y DESPLEGADO
- **Cierre:** tipos/scope controlados, artefactos PDF inmutables y tokens públicos con lifecycle separado.

### 2026-09-03 — T1 histórico operativo append-only
- **Estado:** IMPLEMENTADO, MIGRADO Y DESPLEGADO
- **Cierre:** eventos solo lectura/inserción para roles de aplicación; correcciones mediante eventos compensatorios.

### 2026-09-01 — Logotipo de acceso sin recortes (wrapper)
- **Estado:** PR #39 IMPLEMENTADO Y DESPLEGADO EN PRODUCCIÓN
- **Cierre:** se eliminó el clipping heredado del wrapper y se preservó la proporción natural; la regresión posterior del glifo `A` causada por el viewport interno del SVG se trató como un defecto nuevo y quedó cerrada posteriormente por PR #49.

### 2026-08-25 — Maestro mundial de países y subdivisiones
- **Estado:** IMPLEMENTADO, MIGRADO Y DESPLEGADO
- **Cierre:** catálogo ISO mundial, subdivisiones y validación postal fiable.

### 2026-08-25 — Maestro de clientes y submaestros persistentes
- **Estado:** IMPLEMENTADO Y DESPLEGADO
- **Cierre:** datos fiscales, contactos, servicios, bloqueos, direcciones y tarifas versionadas con aislamiento tenant.
