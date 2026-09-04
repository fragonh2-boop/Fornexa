# FORNEXA — Pending log

Registro persistente de trabajo abierto. Verificar siempre contra GitHub, CI, Supabase y Vercel antes de actuar.

## OPEN

### 2026-09-04 — Regresión visual del logotipo de acceso
- **Área:** UX / Auth / Identidad visual
- **Estado:** FIX EN PREPRODUCCIÓN; VERIFICACIÓN VISUAL OBLIGATORIA
- **Evidencia:** captura real de producción muestra la pata inferior derecha de la `A` de `4NXA` recortada. La causa está en el viewport del SVG raíz: el wrapper ya permitía overflow, pero el propio SVG no y dependía de métricas de una pila de fuentes fallback.
- **Acción requerida:** ampliar margen intrínseco del SVG, permitir overflow en el elemento raíz, ejecutar guardas UX/CI y verificar el Preview exacto en escritorio/tablet/móvil antes del merge; después repetir la comprobación en producción.
- **Control reforzado:** `docs/ux/UX_AUDIT_PROTOCOL.md` pasa a ser el criterio de evidencia para cambios visuales. CI/source tests protegen invariantes conocidos, pero no sustituyen una prueba visual desplegada.
- **Criterio de cierre:** CI verde + Preview READY + evidencia visual sin clipping en el SHA actual + producción READY y comprobación final del síntoma reportado.

### 2026-09-04 — DeCA: motor PDF/QR y acceso público
- **Área:** Documentación regulatoria / CMR / Acceso público
- **Estado:** FUNDACIÓN EN PRODUCCIÓN; MOTOR FUNCIONAL PENDIENTE
- **Base disponible:** `cmr_documents`, `regulatory_document_artifacts` inmutable y `regulatory_document_access_tokens` server-only.
- **Acción requerida:** emitir PDF versionado, generar token opaco guardando solo SHA-256, resolver una ruta HTTPS pública fail-closed y producir QR hacia esa ruta.
- **Límites:** no crear una segunda pila documental; separar retención del artefacto y lifecycle de URL; preservar M8, `service_completed_at/public_until`, eCMR y A2 como decisiones separadas.
- **Criterio de cierre:** tests/CI verdes, revisión independiente, preview funcional, migraciones trazables cuando procedan y producción verificada.

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
- **Evidencia:** producción está sana, pero la integración Git de `main` reportó `MIGRATIONS_FAILED`.
- **Criterio de cierre:** preview Supabase con migración real aprobada, sin alterar producción.

### 2026-08-20 — Contraste de recuperación de contraseña
- **Área:** Auth / Login
- **Estado:** PENDIENTE
- **Acción requerida:** mejorar contraste del mensaje de confirmación y validar WCAG AA en escritorio y móvil.

## DONE

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
- **Cierre:** se eliminó el clipping heredado del wrapper y se preservó la proporción natural; la regresión posterior del glifo `A` causada por el viewport interno del SVG se registra como un defecto nuevo arriba y no reabre PR #39.

### 2026-08-25 — Maestro mundial de países y subdivisiones
- **Estado:** IMPLEMENTADO, MIGRADO Y DESPLEGADO
- **Cierre:** catálogo ISO mundial, subdivisiones y validación postal fiable.

### 2026-08-25 — Maestro de clientes y submaestros persistentes
- **Estado:** IMPLEMENTADO Y DESPLEGADO
- **Cierre:** datos fiscales, contactos, servicios, bloqueos, direcciones y tarifas versionadas con aislamiento tenant.
