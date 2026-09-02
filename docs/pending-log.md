# FORNEXA — Pending log

Este archivo es el registro persistente de temas pendientes que deben poder recuperarse desde cualquier sesión/dispositivo. Cuando el usuario indique algo como **"revisa logs de temas pendientes"**, revisar este archivo antes de pedir contexto adicional.

## OPEN

### 2026-09-01 — TLM-1 telemetría privada de plataforma
- **Área:** Plataforma / Observabilidad / Seguridad / Analítica web
- **Estado:** INTEGRADO EN `main`; verificación operativa pendiente.
- **Evidencia de integración:** PR #37 se fusionó como `1db6222…`; GitHub registra `validate` y los contextos de preview de Vercel correctos. Supabase Preview fue omitido.
- **Decisión funcional convergida:** alcance para todo `fornexasc.com`, no solo sesiones autenticadas; propósito de analítica web/conversión general, no vigilancia dirigida a una persona concreta.
- **Arquitectura convergida:** esquema separado `platform_telemetry`; panel interno sin enlace de navegación; autorización server-side OWNER + allowlist explícita; nunca secretos elevados en cliente; sin rrweb/DOM replay en TLM-1; ingesta best-effort/asíncrona para que un fallo de telemetría no degrade tráfico real.
- **Privacidad/minimización:** no persistir contraseñas, tokens, payloads arbitrarios ni query strings; email de login solo como hash; IP en claro durante 7 días y eventos/metadatos durante 90 días, con purga automática.
- **Acción requerida:** verificar migración/advisors y privilegios RPC; configurar allowlist/hash-secret solo en servidor; validar captura request/auth/page y comprobar que usuarios no autorizados reciben 404 en `/internal/telemetry`.
- **Criterio de cierre:** migración/advisors/permisos verificados, telemetría real visible para OWNER allowlisted, acceso no autorizado 404 y ausencia de secretos/contenido sensible.

### 2026-08-27 — Integración de ramas Supabase en estado fallido
- **Área:** Plataforma / CI / Supabase Preview
- **Estado:** PENDIENTE DE DIAGNÓSTICO Y CORRECCIÓN
- **Evidencia:** issue #32 sigue abierto y sin cambios desde 2026-08-27; los checks Supabase Preview de PR #34, #37 y #39 aparecen omitidos. El estado directo de la integración no se verificó en esta ejecución.
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

### 2026-09-01 — Corrección de clipping del logotipo de acceso
- **Área:** Auth / Login / Identidad visual
- **Estado:** INTEGRADO EN `main` (`7449ec9…`); despliegue de producción no revalidado en esta ejecución.
- **Cierre de código:** PR #39 aisló el wrapper del login bajo `.login-brand-logo`, retirando la altura fija y el `overflow: hidden` heredados sin modificar el flujo de autenticación.
- **Evidencia:** PR fusionada; `validate` y previews de Vercel correctos. Supabase Preview omitido.

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
