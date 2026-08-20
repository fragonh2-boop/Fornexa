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

- Ir moviendo aquí los elementos cerrados, indicando commit/deployment cuando corresponda.
