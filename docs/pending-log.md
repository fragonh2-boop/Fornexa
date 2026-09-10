# FORNEXA — Pending log

Registro persistente de trabajo abierto. Verificar siempre contra GitHub, CI, Supabase, Vercel y Slack antes de actuar. El historial detallado anterior permanece en Git; este archivo prioriza el estado operativo vigente.

## OPEN

### 2026-09-10 — DeCA: E2E autenticado sobre domicilio FISCAL canónico
- **Área:** Documentación regulatoria / CMR / Acceso público / Auth
- **Estado:** INFRAESTRUCTURA FISCAL EN PRODUCCIÓN; POST AUTENTICADO CONTROLADO PENDIENTE
- **Base productiva:** PR #64 está fusionada en `e594b2d0ca40105c3d0c5ce41e735ddf98b21e79`; CI #270 `success`; Vercel producción `dpl_5rMsn1b39JA4GiefVjHPZivvNEpG` READY en el mismo SHA. La migración `canonical_fiscal_address` se aplicó DB-first y el smoke confirmó índice parcial FISCAL, constraint bidireccional, RPC disponible solo para `service_role`, y 0 filas FISCAL creadas accidentalmente.
- **Evidencia previa:** `docs/verification/canonical-fiscal-address-20260910.md` documenta ejecución real `BEGIN…ROLLBACK` de la RPC create+update con 1 FISCAL canónico/activo, 2 audit_events y rollback completo.
- **Bloqueo actual:** el endpoint nativo DeCA exige una sesión FORNEXA real OWNER/ADMIN. El entorno automatizado no dispone de una sesión Web legítima; el login normal es email+contraseña y los flujos de primera activación/recuperación crearían o cambiarían contraseña. No resetear credenciales, no reutilizar secretos y no fabricar usuarios para hacer pasar el gate.
- **Fixture:** no reutilizar `CMR-E2E-MOBILE-20260819`: carece de relaciones canónicas sender/carrier y de datos de vehículo. Producción no contiene actualmente ningún CMR con sender_party_id y carrier_party_id canónicos simultáneamente. El E2E debe usar un fixture explícitamente sintético y aislado.
- **Acción requerida:** con una sesión OWNER/ADMIN legítima, ejecutar POST real a la ruta productiva y verificar 201, PDF nativo, Storage privado, artifact/version/hash/size, token público almacenado solo como SHA-256, resolución pública sin credenciales, hash del PDF descargado y lifecycle.
- **Límites:** M8 sigue separado; no inferir roles desde strings; eCMR signing/auth/jurisdiction y lifecycle automático siguen como bloques distintos.
- **Criterio de cierre:** E2E HTTP autenticado documentado con trazabilidad completa y sin mutar credenciales personales.

### 2026-09-10 — CMR: marco físico de hojas de continuación
- **Área:** CMR / Impresión-PDF / UX
- **Estado:** MEJORA VISUAL OPCIONAL; CONTINUIDAD E INTEGRIDAD CERRADAS
- **Base productiva:** PR #66 está en producción como `f7bfa5701a0b27d83cf63a77c2e036377a37b2c9`; CI #282 `success`; Vercel producción `dpl_6AaVKan2Qbbf7Hu6ozHRcjCGvZF3` READY en el mismo SHA. La identidad CMR y los encabezados 6–12 ya se repiten en cada hoja con mercancía.
- **Mejora pendiente:** valorar un marco físico explícito por cada hoja de continuación. Debe tratarse como refinamiento cosmético independiente, sin reabrir no-clipping, integridad, repetición de `thead` ni el contrato A4 ya desplegado.
- **Criterio de cierre:** evidencia visual en Preview que confirme el marco por hoja sin alterar la paginación validada.

### 2026-09-05 — QR visible y listo antes de imprimir/exportar CMR
- **Área:** CMR / QR / Impresión-PDF / UX
- **Estado:** INTEGRADO Y DESPLEGADO; VALIDACIÓN NATIVA CON QR REAL DE FRAN SIGUE SEPARADA
- **Cierre técnico:** PR #52 está integrada y la lógica bloquea imprimir/exportar hasta que el QR exacto carga; el fallo se representa sin imagen rota y permite retry sin relajar expiración/revocación.
- **Pendiente de aceptación:** Fran valida cuando convenga un PDF/diálogo nativo con QR real y un CMR operativo. La verificación sintética de paginación de 2026-09-10 valida layout/clipping, no sustituye esta aceptación de QR real.

### 2026-09-04 — MMO-1 ejecución Preview controlada
- **Área:** IA / Orquestación / Seguridad
- **Estado:** BACKLOG — REQUIERE CONFIGURACIÓN PREVIEW AISLADA
- **Evidencia:** PR #38 sigue draft y separada del flujo productivo actual.
- **Bloqueo:** configurar sus variables server-side exclusivamente para Preview; Production debe permanecer sin flag activo ni claves de proveedores.
- **Después:** una ejecución sobre `public_code`, revisión de salida sanitizada, retirada de route/page/flag temporal, nuevo CI/Preview, revisión final y merge condicionado.

### 2026-09-01 — TLM-1 telemetría privada de plataforma
- **Área:** Plataforma / Observabilidad / Seguridad
- **Estado:** CANAL INTERNO; CONFIGURACIÓN Y VERIFICACIÓN FINAL PENDIENTES
- **Acción requerida:** configurar/verificar allowlist OWNER y hash secret dedicado, validar captura real y confirmar fail-closed para usuarios no autorizados.
- **Privacidad:** mantener exclusión de contraseñas, tokens, payloads arbitrarios y query strings.

### 2026-08-27 — Integración de ramas Supabase / provenance A2
- **Área:** Plataforma / CI / Supabase Preview
- **Estado:** PENDIENTE DE RECONCILIACIÓN
- **Acción requerida:** reparar/verificar Supabase Git branch Preview con una migración real segura y reconciliar diferencias de versiones/timestamps entre repositorio y remoto bajo A2.
- **Límite:** no alterar ni rerun de migraciones ya aplicadas en producción.

### 2026-08-20 — Contraste de recuperación de contraseña
- **Área:** Auth / Login
- **Estado:** PENDIENTE
- **Acción requerida:** mejorar contraste del mensaje de confirmación y validar WCAG AA en escritorio y móvil.

## DONE

### 2026-09-10 — CMR: identidad y cabeceras repetidas en hojas de continuación
- **Estado:** PR #66 INTEGRADA, DESPLEGADA Y VERIFICADA
- **Cierre:** PR #66 se fusionó por squash en `f7bfa5701a0b27d83cf63a77c2e036377a37b2c9`; GitHub CI #282 (`34475309230`) terminó `success`; Vercel producción `dpl_6AaVKan2Qbbf7Hu6ozHRcjCGvZF3` quedó READY en el mismo SHA, sirve `fornexasc.com` y la consulta runtime no devolvió warning/error/fatal en la ventana comprobada. Las mercancías 6–12 usan tabla semántica con `thead` repetible, identidad CMR y encabezados de columna en cada hoja que contiene mercancía. El harness manual versionado se ejecutó con Chromium 144.0.7559.96: normal 2 líneas→1 página; 42→3 páginas/42 de 42; 42 con fila larga→3 páginas/42 de 42 sin hoja vacía; 80→4 páginas/80 de 80. DeepSeek revisó el HEAD final `c7a203853f319df637cc3aa14577e9a01aa9cac3` con MUST ninguno. Claude no respondió al handoff exact-HEAD antes del merge; bajo instrucción de Fran se registra como excepción de gobernanza y no como aprobación Claude. El marco físico por hoja permanece como mejora cosmética separada.

### 2026-09-10 — Domicilio FISCAL canónico para documentación regulatoria
- **Estado:** PR #64 INTEGRADA, MIGRADA Y DESPLEGADA
- **Cierre:** la migración `canonical_fiscal_address` se aplicó primero en Supabase producción; smoke posterior confirmó índice/constraint/RPC, `service_role` con EXECUTE y `authenticated/anon` sin EXECUTE, sin crear filas FISCAL. PR #64 se fusionó después por squash en `e594b2d0ca40105c3d0c5ce41e735ddf98b21e79`; CI #270 terminó `success`; Vercel producción `dpl_5rMsn1b39JA4GiefVjHPZivvNEpG` quedó READY en el mismo SHA y sin warning/error/fatal en la ventana comprobada. DeepSeek cerró sus MUST sobre el HEAD final de PR; el handoff Claude exact-head no respondió antes del rollout y Fran autorizó explícitamente continuar, por lo que se registra como excepción de gobernanza y no como aprobación Claude.

### 2026-09-10 — CMR sin clipping silencioso en contenido extremo
- **Estado:** PR #62 INTEGRADA, DESPLEGADA Y VERIFICADA
- **Cierre:** merge SHA `5ee1966d395b6b8c3206b18bddf7c478cf2200bd`; GitHub CI #253 `success`; Vercel producción `dpl_5SCoG4J42weTaGs2QBFGA9HeZJQv` READY en el mismo SHA; sin warning/error/fatal en la ventana runtime comprobada. Chromium confirmó 1 página normal y 2 páginas extremas sin pérdida de los 28 goods, ADR, bloques inferiores, firmas o footer. La continuidad visual de identidad/cabeceras fue cerrada posteriormente por PR #66.

### 2026-09-09 — Reviewer DeepSeek: protocolo MAIN vs PR
- **Estado:** PRS #8, #9 Y #10 DEL REPOSITORIO DEL REVIEWER INTEGRADAS
- **Cierre:** el reviewer admite revisiones explícitas de estado de repositorio y separa MAIN de PR; `MODE: MAIN`/`TARGET: main` no puede quedar secuestrado por referencias narrativas a PR históricas. El reviewer `main` está en `6461eb0a16c3b7ffbeff9f558de64ebb945f23e0`. Sigue siendo independiente/read-only para FORNEXA.

### 2026-09-08 — Recuperación del reviewer DeepSeek en Slack
- **Estado:** PRS #6 Y #7 DEL REPOSITORIO DEL BOT INTEGRADAS
- **Cierre:** se corrigieron `HEAD:`/`HEAD exacto:` y la deduplicación que confundía solicitudes humanas posteriores con respuestas propias; el servicio usa explícitamente DeepSeek V4 Pro sin ampliar permisos.

### 2026-09-08 — CMR firmas y geometría A4
- **Estado:** PRS #59 Y #60 INTEGRADAS Y DESPLEGADAS
- **Cierre:** firmas 22–24 vinculadas a partes/evidencias reales y aprovechamiento de la página A4 corregido. PR #62 añadió después la protección de paginación para contenido extremo.

### 2026-09-07 — DeCA P0-A / P0-B
- **Estado:** INTEGRADO Y DESPLEGADO
- **Cierre técnico:** lifecycle mínimo público corregido y generador PDF DeCA nativo/emisión atómica incorporados. El E2E funcional completo, M8, lifecycle automático y eCMR permanecen como gates separados.

### 2026-09-05 — Login recuperable tras fallo transitorio de cliente
- **Estado:** PR #53 INTEGRADA EN `21fe9819b1d85c9f3b2567d570b41ebd2651b020`; PRESENTE EN PRODUCCIÓN ACTUAL
- **Cierre:** una inicialización Supabase cliente rechazada ya no queda cacheada para toda la pestaña; un intento posterior vuelve a cargar configuración/red y los tests cubren tanto recuperación tras fallo como conservación del singleton tras éxito.

### 2026-09-04 — Regresión visual del logotipo de acceso
- **Estado:** INTEGRADA Y VERIFICADA EN PRODUCCIÓN
- **Cierre:** viewport/overflow del SVG corregido y protocolo UX reforzado para exigir evidencia visual desplegada en cambios de layout, SVG, responsive o impresión.

### 2026-09-03 — CMR interno, QR e impresión
- **Estado:** PRS #44–#47 INTEGRADAS Y VERIFICADAS EN PRODUCCIÓN
- **Cierre:** acceso tenant-aware, QR interno seguro y exportación A4 sin chrome del dashboard.

### 2026-09-03 — DeCA-1 fundación documental
- **Estado:** IMPLEMENTADO, MIGRADO Y DESPLEGADO
- **Cierre:** tipos/scope controlados, artefactos PDF inmutables y tokens públicos con lifecycle separado.

### 2026-09-03 — T1 histórico operativo append-only
- **Estado:** IMPLEMENTADO, MIGRADO Y DESPLEGADO
- **Cierre:** eventos solo lectura/inserción para roles de aplicación; correcciones mediante eventos compensatorios.
