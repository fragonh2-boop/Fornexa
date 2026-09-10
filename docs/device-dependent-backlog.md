# FORNEXA — Device-dependent backlog

Registro de validaciones que no deben bloquear trabajo ejecutable desde el entorno actual. Estos puntos requieren un navegador/sesión legítima o un dispositivo físico no disponible en este runtime. No se deben sortear creando credenciales, usuarios o evidencias artificiales.

## BACKLOG — requiere navegador/sesión FORNEXA legítima

### DeCA — E2E HTTP autenticado OWNER/ADMIN
- **Motivo del backlog:** el runtime actual no dispone de `agent-browser`, de otra automatización de navegador conectada ni de una sesión Web FORNEXA legítima reutilizable.
- **No permitido para desbloquearlo:** resetear credenciales personales, reutilizar secretos, crear un usuario artificial o fabricar cookies/JWT.
- **Cuando exista dispositivo/sesión válida:** ejecutar el POST productivo con fixture CMR sintético y canónico; verificar HTTP 201, PDF nativo, objeto Storage, artifact/version/hash/size, token persistido solo como SHA-256, resolución pública sin credenciales, hash del PDF descargado y lifecycle.
- **Gates separados:** M8, eCMR signing/auth/jurisdiction y automatización del lifecycle no se consideran cerrados por este E2E.

### CMR — aceptación nativa con QR real
- **Motivo del backlog:** la lógica de preparación/impresión ya está desplegada, pero la aceptación final exige un navegador real con un CMR operativo y QR real.
- **Cuando exista dispositivo/sesión válida:** validar diálogo/PDF nativo, carga del QR exacto, bloqueo ante QR no disponible y resultado impreso/exportado.
- **Nota:** la evidencia sintética de paginación/Chromium no sustituye esta aceptación.

## Regla de trabajo

Cuando una tarea dependa exclusivamente de capacidades de dispositivo no presentes en el runtime actual, mover aquí su gate de aceptación y continuar con el siguiente bloque ejecutable. No degradar controles de seguridad ni crear datos/credenciales artificiales para evitar el backlog.
