# FORNEXA — Pending log

Este archivo es el registro persistente de temas pendientes que deben poder recuperarse desde cualquier sesión/dispositivo. Cuando el usuario indique algo como **"revisa logs de temas pendientes"**, revisar este archivo antes de pedir contexto adicional.

## OPEN

### 2026-09-02 — MMO-1 orquestación GPT–Claude–DeepSeek
- **Área:** Plataforma / IA / Revisión de ingeniería
- **Estado:** FUNDACIÓN EN PR #38; ACTIVACIÓN TEMPORAL PREVIEW IMPLEMENTADA Y AÚN DESHABILITADA
- **Evidencia:** rama `feat/multi-model-orchestrator` sincronizada con `main`; 51/51 tests, typecheck, lint focalizado y build pasan; clasificación `public_code` obligatoria, detector de secretos, límites de timeout/retry/tokens, correlación de runs y máximo programático de dos rondas. La superficie temporal exige branch Preview exacta, flag de servidor, OWNER autenticado y POST same-origin; usa un paquete fijo y omite texto bruto.
- **Acción requerida:** obtener CI/Preview verdes, habilitar el flag solo en la rama, ejecutar una revisión controlada, registrar la evidencia normalizada y deshabilitar/eliminar inmediatamente la superficie temporal antes del merge. No crear webhook ni trigger automático en esta fase.
- **Criterio de cierre:** primera revisión real devuelve resultados normalizados de los proveedores autorizados sin exponer credenciales ni enviar datos no públicos; hallazgos clasificados con evidencia; decisión explícita antes de cualquier automatización.

### 2026-09-01 — Logotipo SVG recortado en la pantalla de acceso
- **Área:** Auth / Login / Identidad visual
- **Estado:** PR #39 INTEGRADO Y DESPLEGADO; COMPROBACIÓN VISUAL FINAL PENDIENTE
- **Evidencia:** producción carga un contenedor `.auth-logo` de `360 × 54 px` con `overflow: hidden`, mientras el SVG mide `360 × 161,76 px`; el fondo duplicado desapareció con PR #36, pero aproximadamente 108 px del logotipo real siguen ocultos.
- **Acción requerida:** comprobar visualmente en producción escritorio y móvil que el despliegue `7449ec9…`, en estado `READY`, muestra el SVG completo.
- **Criterio de cierre:** una sola marca FORNEXA completa y proporcionada en `/login`, sin fondo heredado, clipping ni regresiones responsive; commit de producción verificado en Vercel.

### 2026-09-01 — TLM-1 telemetría privada de plataforma
- **Área:** Plataforma / Observabilidad / Seguridad / Analítica web
- **Estado:** PR #37 INTEGRADO Y DESPLEGADO; CONFIGURACIÓN/VALIDACIÓN OPERATIVA PENDIENTE
- **Decisión funcional convergida:** alcance para todo `fornexasc.com`, no solo sesiones autenticadas; propósito de analítica web/conversión general, no vigilancia dirigida a una persona concreta.
- **Arquitectura convergida:** esquema separado `platform_telemetry`; panel interno sin enlace de navegación; autorización server-side OWNER + allowlist explícita; nunca secretos elevados en cliente; sin rrweb/DOM replay en TLM-1; ingesta best-effort/asíncrona para que un fallo de telemetría no degrade tráfico real.
- **Privacidad/minimización:** no persistir contraseñas, tokens, payloads arbitrarios ni query strings; email de login solo como hash; IP en claro durante 7 días y eventos/metadatos durante 90 días, con purga automática.
- **Rama integrada:** `feat/tlm1-platform-telemetry` mediante PR #37 (`1db6222…`).
- **Acción requerida:** configurar allowlist/hash-secret en entorno de servidor, validar captura request/auth/page y comprobar que usuarios no autorizados reciben 404 en `/internal/telemetry`.
- **Criterio de cierre:** PR integrado con checks verdes; migración registrada y advisors sin hallazgos críticos nuevos; telemetría real visible en panel para OWNER allowlisted; intentos de acceso y recorridos por sesión verificables; ausencia de secretos/contenido sensible; fallo simulado de persistencia sin afectar navegación o login.

### 2026-08-27 — Integración de ramas Supabase en estado fallido
- **Área:** Plataforma / CI / Supabase Preview
- **Estado:** PENDIENTE DE DIAGNÓSTICO Y CORRECCIÓN
- **Evidencia:** producción contiene la migración `tariff_engine_foundation` y el proyecto está sano, pero la integración Git de la rama `main` continúa reportando `MIGRATIONS_FAILED`.
- **Acción requerida:** identificar el fallo de la integración, corregir la causa y ejecutar una preview que incluya una migración real.
- **Criterio de cierre:** integración de ramas sin error y control Supabase Preview aprobado en una PR con migración, sin alterar datos de producción durante la prueba.

### 2026-08-20 — Contraste insuficiente en mensaje informativo de recuperación de contraseña
- **Área:** Auth / Login / Recover password
- **Estado:** PENDIENTE DE IMPLEMENTAR Y DESPLEGAR
- **Observación:** tras solicitar recuperación de contraseña, el mensaje de confirmación mostrado debajo del botón tiene contraste insuficiente y resulta difícil de leer sobre el fondo claro.
- **Texto observado:** "Te hemos enviado el enlace de recuperación. Revisa también la carpeta de spam."
- **Acción requerida:** ajustar estilos del estado informativo/success de `auth-message` para cumplir contraste visual adecuado sin alterar el layout.
- **Criterio de aceptación:** mensaje claramente legible en escritorio y móvil; mantener coherencia visual FORNEXA; revisar contraste WCAG AA cuando sea posible.
- **Después de corregir:** commit en `main`, despliegue a Vercel y validación visual en `fornexasc.com/login` → Recuperar contraseña.

## DONE

### 2026-08-25 — Maestro mundial de países y subdivisiones geográficas
- **Área:** Maestros / Direcciones / País / Provincia-región
- **Estado:** IMPLEMENTADO, MIGRADO Y DESPLEGADO
- **Motivo:** el Maestro de direcciones solo ofrecía España, Francia y Portugal y un subconjunto hardcodeado de provincias/regiones.
- **Solución:** catálogo mundial de países ISO 3166-1 con nombres localizados en español y catálogo completo de subdivisiones administrativas por país. España utiliza sus 52 provincias y Francia utiliza departamentos porque son la unidad que se corresponde con la estructura postal solicitada.
- **Identificador normalizado:** se añadió `party_addresses.subdivision_key`. La clave comienza por el prefijo postal cuando existe una correspondencia administrativa real y después incorpora país y código de subdivisión. Ejemplo: `66-FR-66` = Pyrénées-Orientales.
- **Regla postal:** en España y Francia se valida la coherencia entre CP y provincia/departamento. Para países donde el código postal no codifica la subdivisión, no se inventa una correspondencia; se conserva el código administrativo de la subdivisión.
- **Caso validado:** `FR + 66000` resuelve `Perpignan`; el catálogo devuelve `66-FR-66 · Pyrénées-Orientales`.
- **Persistencia:** migración `20260825150000_address_subdivision_key.sql` aplicada en Supabase y API de direcciones actualizada para leer/escribir `subdivision_key`.
- **Catálogo:** endpoint `/api/geography` desplegado; `/api/geography?country=FR` devuelve los departamentos franceses completos.
- **Commits principales:** `44376a30` modelo geográfico; `7d41ec4a` API mundial; `469db0ca` migración; `5b8ca3c1` persistencia; `76512e4c` editor mundial; `153aa4e5` activación; `006f98ad` corrección de build.
- **Deployment validado:** Vercel `dpl_58k6i3oNocwroXXsdd4Ebc3XFgqL`, READY y asociado a `fornexasc.com`.

### 2026-08-25 — Enriquecimiento conjunto GPT–Claude del maestro de clientes
- **Área:** Clientes / Datos maestros / Comercial / Operaciones
- **Estado:** IMPLEMENTADO Y DESPLEGADO EN PRODUCCIÓN (`de0a495`).
- **Cierre:** datos fiscales ampliados, responsable de cuenta real, perfil de facturación tipado, contactos, servicios, capacidades de dirección, bloqueos y tarifas versionadas con vigencia.
- **Trazabilidad:** auditoría de cambios, aislamiento tenant, estados del cliente y fotografía de tarifa en el pedido.

### 2026-08-25 — Limpieza de microcopys técnicos
- **Área:** UX transversal
- **Estado:** IMPLEMENTADO Y DESPLEGADO EN PRODUCCIÓN (`de0a495`).
- **Cierre:** retirado el texto «Incluye prefijo internacional» y eliminadas del frontend las variantes visibles de «canónico/canónica».

### 2026-08-25 — Persistencia real de submaestros de cliente
- **Área:** Clientes / Plataforma
- **Estado:** IMPLEMENTADO Y DESPLEGADO EN PRODUCCIÓN (`de0a495`).
- **Cierre:** servicios dejan de usar almacenamiento local; contactos y tarifas disponen de APIs y tablas propias; los registros de demostración quedan identificados para revisión, sin borrado destructivo.
