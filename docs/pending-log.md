# FORNEXA — Pending log

Registro persistente de trabajo abierto. Verificar siempre contra GitHub, CI, Supabase, Vercel y Slack antes de actuar. El historial detallado anterior permanece en Git; este archivo prioriza el estado operativo vigente.

## OPEN

### 2026-09-11 — TLM-1 telemetría privada de plataforma
- **Área:** Plataforma / Observabilidad / Seguridad / Privacidad
- **Estado:** FIX FAIL-SAFE DESPLEGADO; CONFIGURACIÓN Y VERIFICACIÓN FINAL PENDIENTES
- **Base productiva:** PR #68 se fusionó por squash en `c9e9b76550162c9d549803e0b02031d8716bf401`; CI main #287 terminó `success`; Vercel producción `dpl_FFpT54jAjjeZVek6z81bHNdzQHjK` quedó READY en el mismo SHA, sirve `fornexasc.com` y la consulta runtime no devolvió warning/error/fatal en la ventana comprobada.
- **Privacidad desplegada:** requests y auth comparten `telemetryNetworkIdentity()`. Con secreto dedicado e IP disponible → `ip` + HMAC SHA-256. Sin secreto o sin IP → `ip=null` e `ip_hash=null`; ya no existe degradación a IP en claro sin hash.
- **Smoke productivo:** una petición controlada GET `/` posterior al deployment creó una fila nueva en `platform_telemetry.telemetry_requests` con `ip IS NULL=true` e `ip_hash IS NULL=true`, confirmando el fail-safe mientras el secreto sigue sin configurar.
- **Pruebas/revisión:** PR CI #286 `success`, Preview `dpl_D5JurVjg4WQNJoD4eXfTwNsRa2SU` READY y sin warning/error/fatal en la ventana comprobada. DeepSeek exact-HEAD `229c4ce3870f63db6fe3f18ff6e52fd0ba7695d2`: MUST ninguno. Claude había aprobado el diseño con MUST ninguno; la solicitud final exact-HEAD no respondió antes del merge y se registra como excepción de gobernanza, no como aprobación exact-HEAD. Fran indicó explícitamente proceder.
- **Acción requerida:** configurar un `FORNEXA_TELEMETRY_HASH_SECRET` dedicado y de alta entropía, configurar/verificar `FORNEXA_TELEMETRY_OWNER_EMAILS`, generar tráfico controlado y comprobar IP + HMAC real, acceso `/internal/telemetry` para OWNER autorizado y 404 para no autorizados.
- **Retención residual:** `platform_telemetry.run_retention_if_due()` sigue siendo oportunista y se dispara durante capturas con throttle de una hora; no es un cron garantizado cuando no hay tráfico.
- **No hacer:** no reutilizar secretos de Supabase/auth/aplicación; no introducir migración ni cron para reabrir este ciclo sin una decisión separada.
- **Criterio de cierre:** secreto + allowlist configurados y verificados en producción, hashes nuevos observados y controles de acceso confirmados sin relajar el fail-safe.

### 2026-09-10 — DeCA: E2E autenticado sobre domicilio FISCAL canónico
- **Área:** Documentación regulatoria / CMR / Acceso público / Auth
- **Estado:** INFRAESTRUCTURA FISCAL EN PRODUCCIÓN; POST AUTENTICADO CONTROLADO PENDIENTE
- **Base productiva:** PR #64 está fusionada en `e594b2d0ca40105c3d0c5ce41e735ddf98b21e79`; la migración `canonical_fiscal_address` se aplicó DB-first y el smoke confirmó índice parcial FISCAL, constraint bidireccional, RPC service-role only y 0 filas FISCAL creadas accidentalmente.
- **Evidencia:** `docs/verification/canonical-fiscal-address-20260910.md` documenta ejecución real `BEGIN…ROLLBACK` de la RPC create+update con 1 FISCAL canónico/activo, 2 audit_events y rollback completo.
- **Bloqueo:** el endpoint nativo DeCA exige una sesión FORNEXA real OWNER/ADMIN. No resetear credenciales, no reutilizar secretos y no fabricar usuarios, cookies o JWTs para hacer pasar el gate.
- **Fixture:** no reutilizar `CMR-E2E-MOBILE-20260819`; carece de relaciones canónicas sender/carrier y datos de vehículo. Usar un fixture explícitamente sintético y aislado.
- **Acción requerida:** con sesión OWNER/ADMIN legítima, ejecutar POST productivo y verificar 201, PDF nativo, Storage privado, artifact/version/hash/size, token público almacenado solo como SHA-256, resolución pública sin credenciales, hash descargado y lifecycle.
- **Límites:** M8, eCMR signing/auth/jurisdiction y lifecycle operativo automático siguen separados.

### 2026-09-10 — CMR: marco físico de hojas de continuación
- **Área:** CMR / Impresión-PDF / UX
- **Estado:** MEJORA VISUAL OPCIONAL; CONTINUIDAD E INTEGRIDAD CERRADAS
- **Base productiva:** PR #66 está en producción como `f7bfa5701a0b27d83cf63a77c2e036377a37b2c9`; identidad CMR y encabezados 6–12 se repiten en cada hoja con mercancía.
- **Mejora pendiente:** valorar un marco físico explícito por cada hoja de continuación. Tratarlo como refinamiento cosmético independiente, sin reabrir no-clipping, integridad, repetición de `thead` ni contrato A4.

### 2026-09-05 — QR visible y listo antes de imprimir/exportar CMR
- **Área:** CMR / QR / Impresión-PDF / UX
- **Estado:** INTEGRADO Y DESPLEGADO; VALIDACIÓN NATIVA CON QR REAL SIGUE SEPARADA
- **Cierre técnico:** PR #52 bloquea imprimir/exportar hasta que el QR exacto carga; fallo representado sin imagen rota y retry sin relajar expiración/revocación.
- **Pendiente de aceptación:** validar desde dispositivo/navegador apropiado un PDF/diálogo nativo con QR real y un CMR operativo. La evidencia sintética de paginación no sustituye esta aceptación.

### 2026-09-04 — MMO-1 ejecución Preview controlada
- **Área:** IA / Orquestación / Seguridad
- **Estado:** BACKLOG — REQUIERE CONFIGURACIÓN PREVIEW AISLADA
- **Evidencia:** PR #38 sigue draft y separada del flujo productivo actual.
- **Bloqueo:** configurar variables server-side exclusivamente para Preview; Production debe permanecer sin flag activo ni claves de proveedores.
- **Después:** una ejecución sobre `public_code`, revisión de salida sanitizada, retirada de route/page/flag temporal, nuevo CI/Preview, revisión final y merge condicionado.

### 2026-08-27 — Integración de ramas Supabase / provenance A2
- **Área:** Plataforma / CI / Supabase Preview
- **Estado:** PENDIENTE DE RECONCILIACIÓN; PRODUCCIÓN SANA, GIT INTEGRATION MIGRATIONS_FAILED
- **Diagnóstico 2026-09-10:** 34 migraciones SQL activas en repo vs 33 en historial estándar; 29 equivalencias lógicas con timestamps/versiones distintas; 2 repo-only y 1 remote-only; familias activas duplicadas alrededor de 20260812/17/18/19.
- **Acción requerida:** construir replay/Preview controlado y mapa de equivalencias exacto antes de cualquier reparación del historial.
- **Límite:** no alterar ni rerun de migraciones ya aplicadas; no ejecutar `migration repair` a ciegas; no crear una rama Supabase de pago sin aprobación explícita.

## DONE

### 2026-09-11 — Contraste de recuperación de contraseña
- **Estado:** VALIDADO; NO REQUIERE CAMBIO VISUAL
- **Cierre:** el mensaje de éxito actual usa `#14532d` sobre `#ecfdf3`; la relación de contraste calculada es 8,64:1, superior a WCAG AA para texto normal y también al umbral AAA de 7:1. El pendiente era obsoleto; no se cambian colores innecesariamente.

### 2026-09-11 — TLM-1: fail-safe de IP sin secreto
- **Estado:** PR #68 INTEGRADA, DESPLEGADA Y VERIFICADA; TLM-1 GLOBAL SIGUE ABIERTO POR CONFIGURACIÓN
- **Cierre técnico:** el código ya no persiste IP en claro cuando falta el secreto dedicado. PR #68 → `c9e9b76550162c9d549803e0b02031d8716bf401`; CI #287 success; Vercel producción `dpl_FFpT54jAjjeZVek6z81bHNdzQHjK` READY exact-SHA; runtime limpio en la ventana comprobada; smoke productivo GET `/` confirmó `ip=null` + `ip_hash=null`. La entrada OPEN anterior conserva el gate de secreto + allowlist.

### 2026-09-10 — CMR: identidad y cabeceras repetidas en hojas de continuación
- **Estado:** PR #66 INTEGRADA, DESPLEGADA Y VERIFICADA
- **Cierre:** squash `f7bfa5701a0b27d83cf63a77c2e036377a37b2c9`; CI #282 success; Vercel producción READY exact-SHA. Mercancías 6–12 usan tabla semántica con `thead` repetible. Harness Chromium 144.0.7559.96: normal 2 líneas→1 página; 42→3/42 de 42; fila larga→3/42 de 42/sin hoja vacía; 80→4/80 de 80. Marco físico queda como mejora cosmética separada.

### 2026-09-10 — Domicilio FISCAL canónico para documentación regulatoria
- **Estado:** PR #64 INTEGRADA, MIGRADA Y DESPLEGADA
- **Cierre:** migración DB-first, índice/constraint/RPC verificados, sin crear filas FISCAL. PR #64 fusionada y desplegada; DeCA exige FISCAL activo explícito y edición FISCAL queda OWNER/ADMIN.

### 2026-09-10 — CMR sin clipping silencioso en contenido extremo
- **Estado:** PR #62 INTEGRADA, DESPLEGADA Y VERIFICADA
- **Cierre:** A4 conserva contenido extremo mediante paginación sin clipping; verificación Chromium preservó mercancías, ADR, bloques inferiores y firmas.

### 2026-09-09 — Reviewer DeepSeek: protocolo MAIN vs PR
- **Estado:** PRS #8, #9 Y #10 DEL REPOSITORIO DEL REVIEWER INTEGRADAS
- **Cierre:** reviewer separa MAIN/PR, admite estado de repo y mantiene independencia read-only.

### 2026-09-08 — Recuperación del reviewer DeepSeek en Slack
- **Estado:** PRS #6 Y #7 INTEGRADAS
- **Cierre:** triggers HEAD/deduplicación corregidos y DeepSeek V4 Pro operativo sin ampliar permisos.

### 2026-09-08 — CMR firmas y geometría A4
- **Estado:** PRS #59 Y #60 INTEGRADAS Y DESPLEGADAS
- **Cierre:** firmas 22–24 vinculadas a partes/evidencias reales y aprovechamiento A4 corregido; PR #62 añadió paginación extrema.

### 2026-09-07 — DeCA P0-A / P0-B
- **Estado:** INTEGRADO Y DESPLEGADO
- **Cierre técnico:** lifecycle mínimo público corregido y generador PDF DeCA nativo/emisión atómica incorporados. E2E, M8, lifecycle automático y eCMR siguen como gates separados.

### 2026-09-05 — Login recuperable tras fallo transitorio de cliente
- **Estado:** INTEGRADO Y PRESENTE EN PRODUCCIÓN
- **Cierre:** un fallo de inicialización Supabase cliente ya no queda cacheado para toda la pestaña; un intento posterior vuelve a cargar configuración/red.

### 2026-09-04 — Regresión visual del logotipo de acceso
- **Estado:** INTEGRADA Y VERIFICADA EN PRODUCCIÓN
- **Cierre:** viewport/overflow SVG corregido y protocolo UX reforzado para evidencia visual desplegada.

### 2026-09-03 — CMR interno, QR e impresión
- **Estado:** PRS #44–#47 INTEGRADAS Y VERIFICADAS EN PRODUCCIÓN
- **Cierre:** acceso tenant-aware, QR interno seguro y exportación A4 sin chrome del dashboard.

### 2026-09-03 — DeCA-1 fundación documental
- **Estado:** IMPLEMENTADO, MIGRADO Y DESPLEGADO
- **Cierre:** tipos/scope controlados, artefactos PDF inmutables y tokens públicos con lifecycle separado.

### 2026-09-03 — T1 histórico operativo append-only
- **Estado:** IMPLEMENTADO, MIGRADO Y DESPLEGADO
- **Cierre:** eventos solo lectura/inserción para roles de aplicación; correcciones mediante eventos compensatorios.
