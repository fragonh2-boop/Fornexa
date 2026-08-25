# FORNEXA — Pending log

Este archivo es el registro persistente de temas pendientes que deben poder recuperarse desde cualquier sesión/dispositivo. Cuando el usuario indique algo como **"revisa logs de temas pendientes"**, revisar este archivo antes de pedir contexto adicional.

## OPEN

### 2026-08-25 — Maestro de direcciones: catálogo completo de países
- **Área:** Maestros / Direcciones / País
- **Estado:** PENDIENTE DE IMPLEMENTAR Y DESPLEGAR
- **Observación:** el selector de país del Maestro de direcciones muestra actualmente solo un subconjunto reducido (por ejemplo España, Francia y Portugal), insuficiente para una suite logística internacional.
- **Acción requerida:** sustituir el listado limitado por un catálogo completo de países del mundo, preferentemente normalizado mediante ISO 3166-1 (código alpha-2 como clave funcional y nombre localizado para presentación).
- **Alcance recomendado:** reutilizar el mismo catálogo de países en todos los formularios y entidades que manejen direcciones; evitar listas hardcodeadas duplicadas en componentes; mantener España como opción cómoda/default cuando proceda, sin limitar el resto de países.
- **Consideraciones de datos:** revisar la compatibilidad con `party_addresses.country_code` y demás campos `country_code`; conservar códigos existentes y no romper direcciones ya creadas.
- **UX:** selector buscable/autocompletable por nombre y, si resulta útil, por código ISO; ordenar alfabéticamente; soportar nombres traducidos/localizados sin modificar la clave ISO persistida.
- **Criterio de aceptación:** el usuario puede seleccionar cualquier país reconocido por ISO 3166-1 desde el Maestro de direcciones; los valores se guardan y recuperan correctamente; no aparecen duplicados ni países con claves no normalizadas; comportamiento correcto en escritorio y móvil.
- **Validación posterior:** crear/editar direcciones de varios países (UE y no UE), comprobar persistencia en Supabase y reutilización del catálogo en los flujos de Partidas/Expediciones/Viajes que consumen direcciones.
- **Restricción actual:** NO implementar ni desplegar todavía; conservar como TO DO hasta instrucción expresa del usuario.

### 2026-08-20 — Contraste insuficiente en mensaje informativo de recuperación de contraseña
- **Área:** Auth / Login / Recover password
- **Estado:** PENDIENTE DE IMPLEMENTAR Y DESPLEGAR
- **Observación:** tras solicitar recuperación de contraseña, el mensaje de confirmación mostrado debajo del botón tiene contraste insuficiente y resulta difícil de leer sobre el fondo claro.
- **Texto observado:** "Te hemos enviado el enlace de recuperación. Revisa también la carpeta de spam."
- **Acción requerida:** ajustar estilos del estado informativo/success de `auth-message` para cumplir contraste visual adecuado sin alterar el layout.
- **Criterio de aceptación:** mensaje claramente legible en escritorio y móvil; mantener coherencia visual FORNEXA; revisar contraste WCAG AA cuando sea posible.
- **Después de corregir:** commit en `main`, despliegue a Vercel y validación visual en `fornexasc.com/login` → Recuperar contraseña.

## DONE

- Ir moviendo aquí los elementos cerrados, indicando commit/deployment cuando corresponda.
