# FORNEXA — Pending log

Registro persistente de trabajo abierto. Verificar siempre contra GitHub, CI, Supabase y Vercel antes de actuar.

## OPEN

### 2026-09-06 — Completar el contexto de DeepSeek
- **Área:** Gobierno de IA / Contexto / Negocio y cumplimiento
- **Estado:** FASE 0 RECIBIDA; VALIDACIÓN Y RESPUESTAS DE FRAN PENDIENTES
- **Evidencia:** el bot desplegado reconstruyó los siete paquetes autorizados del hilo de incorporación y respondió en siete bloques con 40 preguntas P0/P1/P2, paquete mínimo de contexto y conexiones a considerar, sin adelantar un análisis de producto.
- **Acción requerida:** Fran valida la utilidad y prioridad de las preguntas y decide qué respuestas, documentos o accesos de mínimo privilegio se facilitan. GitHub y Vercel se propusieron como imprescindibles; Supabase redactado y documentos concretos de Drive como útiles; el acceso adicional a Slack como prescindible y limitado a hilos autorizados.
- **Criterio de cierre:** prioridades confirmadas por Fran, respuestas trazables y cualquier acceso adicional expresamente autorizado y limitado. No interpretar la ejecución correcta del bot como aprobación del contenido.

### 2026-09-05 — Login recuperable tras fallo transitorio de cliente
- **Área:** Auth / Login / Resiliencia
- **Estado:** INTEGRADA EN `main` COMO `21fe981`; CI Y CHECKS VERCEL VERDES; SUPABASE PREVIEW FALLIDO; PRODUCCIÓN Y VALIDACIÓN FINAL NO VERIFICADAS
- **Evidencia:** la captura de Fran mostró el error genérico de cliente/red; dos eventos de intento/fallo llegaron a la telemetría HTTP, pero Supabase Auth no recibió una petición `/token`. La configuración pública responde 200, el proyecto está saludable y el preflight CORS permite el origen productivo.
- **Causa confirmada en código:** `createClient()` conservaba una promesa rechazada, por lo que un fallo transitorio impedía que los reintentos posteriores de la misma pestaña volvieran a cargar la configuración o contactar con Auth.
- **Solución preparada:** invalidar únicamente la promesa fallida, conservar el cliente cuando carga correctamente y ofrecer una instrucción de recuperación explícita. Los tests cubren ahora tanto el reintento tras rechazo como la conservación del singleton tras éxito.
- **Revisión y Preview:** Claude revisó el HEAD exacto `0935458`, dictaminó SIN MUST y dejó un único SHOULD: probar el caché de éxito. Tras añadir el test complementario, rerevisó el HEAD exacto `eeccd50`, confirmó el SHOULD consumido y volvió a concluir SIN MUST. CI y ambos checks Vercel pasaron sobre ese HEAD; Supabase Preview se omitió correctamente por no haber esquema. La RPA de Preview cargó el login sin errores de consola y confirmó que una cuenta ficticia llega a Supabase y recibe el mensaje específico de credenciales inválidas.
- **Integración posterior:** PR #53 se fusionó como `21fe981`. En el SHA integrado, CI `33959140426` y los dos checks Vercel finalizaron correctamente; Supabase Preview finalizó en fallo. No se verificó un deployment canónico de producción, su alias de dominio ni RPA de login productivo en esta actualización.
- **Controles locales:** 84/84 tests, typecheck, lint sin errores (siete warnings existentes), build productivo con webpack y `git diff --check` pasan tras consumir el SHOULD.
- **Criterio de cierre:** prueba de regresión, controles completos, Claude sin MUST, producción `READY` verificada en `21fe981`, RPA de reintento y acceso real de Fran. El fallo de Supabase Preview requiere diagnóstico separado; no se debe inferir que está resuelto.

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
- **Evidencia:** la comprobación Supabase Preview de `main` sigue fallando en el SHA actual `21fe981`, mientras que el workflow CI de GitHub `33959140426` terminó verde. Producción previa registra `20260905051522 deca_regulatory_storage`, con timestamp distinto del archivo versionado DeCA-2.
- **Criterio de cierre:** preview Supabase con migración real aprobada y provenance A2 reconciliada, sin alterar ni rerun de producción.

### 2026-08-20 — Contraste de recuperación de contraseña
- **Área:** Auth / Login
- **Estado:** PENDIENTE
- **Acción requerida:** mejorar contraste del mensaje de confirmación y validar WCAG AA en escritorio y móvil.

## DONE

### 2026-09-06 — Ingestión contextual del bot DeepSeek en Slack
- **Estado:** PRS #2–#5 DEL REPOSITORIO DEL BOT INTEGRADAS; SHA `349bf3b` DESPLEGADO Y RPA VERDE
- **Cierre:** se incorporaron ingestión de hilos por paquetes, paginación, identidad estable de autores y detección correcta de raíces Slack. PR #5 exact HEAD `5aec036` pasó build, 11/11 tests, `git diff --check`, auditoría de dependencias sin vulnerabilidades y revisión DeepSeek sin hallazgos. Render dejó el squash `349bf3b` en estado `Live`; el hilo original recibió las siete respuestas esperadas y 40 preguntas de contexto sin análisis inicial.
- **Regla operativa:** si Claude no está disponible, la revisión o negociación se solicita a DeepSeek por Slack con autorización y evidencia; DeepSeek no implementa, fusiona ni despliega.

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
