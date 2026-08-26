# FORNEXA — Pending log

Este archivo es el registro persistente de temas pendientes que deben poder recuperarse desde cualquier sesión/dispositivo. Cuando el usuario indique algo como **"revisa logs de temas pendientes"**, revisar este archivo antes de pedir contexto adicional.

## OPEN

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
- **Estado:** IMPLEMENTADO; pendiente de anotar el identificador final del despliegue.
- **Cierre:** datos fiscales ampliados, responsable de cuenta real, perfil de facturación tipado, contactos, servicios, capacidades de dirección, bloqueos y tarifas versionadas con vigencia.
- **Trazabilidad:** auditoría de cambios, aislamiento tenant, estados del cliente y fotografía de tarifa en el pedido.

### 2026-08-25 — Limpieza de microcopys técnicos
- **Área:** UX transversal
- **Estado:** IMPLEMENTADO; pendiente de anotar el identificador final del despliegue.
- **Cierre:** retirado el texto «Incluye prefijo internacional» y eliminadas del frontend las variantes visibles de «canónico/canónica».

### 2026-08-25 — Persistencia real de submaestros de cliente
- **Área:** Clientes / Plataforma
- **Estado:** IMPLEMENTADO; pendiente de anotar el identificador final del despliegue.
- **Cierre:** servicios dejan de usar almacenamiento local; contactos y tarifas disponen de APIs y tablas propias; los registros de demostración quedan identificados para revisión, sin borrado destructivo.
