# WMS E2: recuperación HU y restauración C3

Este paquete prepara operaciones y las ensaya con datos sintéticos en PG17
desechable. No autoriza ejecutar SQL cloud, activar E2 ni fusionar #145 a main.
La captura certificada, el rol/atomicidad del ejecutor, el respaldo de producción
y la validación funcional UI/API conservan sus gates independientes.

## Dos operaciones explícitas

`ROLLBACK` es el inverso estricto del core E2. Mantiene el bloqueo previo si la
clave pre-E2 colisiona o existen propuestas ejecutadas sin confirmación. No
mezcla ni borra stock para restablecer esa clave. Archiva propuestas, reglas y
vínculos antes de retirar lo añadido por E2, y restaura la función C3 exacta y su
ACL dentro de la misma transacción. Es repetible tras una ejecución limpia.

`PRESERVE_HU` es recuperación compatible hacia delante, **no un inverso del DDL**.
Conserva las filas, columnas, relaciones y clave que admite quants separados por
HU. Restaura C3, archiva el estado E2 y congela las entradas E2: RPC mutantes y
escritura directa en propuestas/reglas pierden permisos de aplicación. Las
tareas y reservas con vínculo E2 quedan protegidas por triggers, de modo que
las rutas compartidas de C3 tampoco puedan modificarlas. Devuelven
`WMS_E2_FROZEN`; las operaciones C3 sin esos vínculos siguen disponibles.

No se liberan reservas ni se cancelan tareas/propuestas automáticamente. La
operación conserva ese estado para su recuperación posterior. Reactivar E2
exige otro paquete revisado que retire explícitamente las guardas
`trg_wms_e2_frozen_*` de tareas, reservas, propuestas y reglas (incluidas las de
TRUNCATE) y su función, restituya
los permisos previstos y pruebe el postestado. Reaplicar únicamente la RPC E2
no constituye esa reactivación. El interruptor de la aplicación debe seguir OFF
hasta completar los gates de datos y validación funcional.

## Preparar el bundle, sin ejecutarlo

Desde la raíz del repositorio:

```sh
node scripts/wms/build-e2-recovery.mjs ROLLBACK /private/tmp/wms-e2-rollback.sql
node scripts/wms/build-e2-recovery.mjs PRESERVE_HU /private/tmp/wms-e2-compatible.sql
```

El generador escribe SQL y un manifiesto `.sql.json` con modo y hashes de
fuentes/cuerpo efectivo. No se conecta a una base de datos y no sobrescribe
archivos existentes. Deben conservarse junto con el SHA revisado y los recibos.

La fuente C3 fijada es
`supabase/migrations/20261019120000_wms_c3_server_load_controls.sql`, SHA256
`deb9cb2f2f375084d01985785ce59b485b8c0a8887d3f445d8d7ab311d907f46`.
Solo se extraen `fornexa_wms_action` y sus dos sentencias de permisos. No se
reejecutan los backfills de reservas ni de políticas de la migración C3. Una
fuente distinta exige revisión de la nueva línea base; no se acepta
silenciosamente. Los scripts de operación sin el bundle rechazan una función
que no corresponda al cuerpo C3 esperado.

La operación y la restauración comparten un único `BEGIN/COMMIT`, con tiempos
máximos de bloqueo y sentencia. La confirmación explícita debe estar en la
misma sesión autorizada: `fornexa.e2_rollback_confirm` con
`ARCHIVE_EXECUTED_AND_PROCEED` para retirar propuestas ejecutadas, o
`fornexa.e2_recovery_confirm` con `PRESERVE_HU_AND_RESTORE_C3` para conservar HU.
Estas confirmaciones técnicas no sustituyen la autorización del destino ni la
prueba de atomicidad del ejecutor cloud. No ejecutar aquí esas operaciones fuera
del PG17 desechable autorizado.

## Archivo y ensayo

Los archivos `private.wms_e2_rollback_archive` y
`private.wms_e2_recovery_archive` tienen RLS y revocaciones explícitas de tabla y
secuencia. La recuperación compatible deduplica por fuente y SHA256 del JSON
archivado y conserva las entradas previas. Mantiene el vínculo de propuesta,
tarea, reserva y operador sin modificar los registros de negocio originales.

El job PG17 existente ejecuta el ensayo ampliado mediante
`scripts/wms/verify-e2-dbfirst-contingency.mjs`; sus guardas de destino y limpieza
de recibos se conservan. La evidencia adicional incluye:

- La definición, firma, propietario, configuración y ACL C3 idénticos al
  preestado del replay versionado, tanto en el inverso como en la recuperación.
- Dos HU/quants que conservan su colisión durante toda la recuperación;
  cantidades, reservas, propietario, historial y stock de otro tenant intactos.
- Repetición sin duplicar el archivo ni cambiar filas, y archivo previo
  conservado incluso si falla una ejecución posterior.
- Error deliberado antes del commit: función, datos, archivo y permisos vuelven
  al estado anterior.
- Denegación de lectura/escritura del archivo para anon, authenticated y
  service_role, incluso con permisos por defecto adversos en el esquema.
- Bloqueo de RPC E2, escritura directa y confirmación de tareas E2 a través de
  C3. Reserva real sobre un solo HU y confirmación de una tarea C3 sin vínculo
  E2 operativas; rechazo de tenant, actor y lote incorrectos sin cambios.

La igualdad con el preestado C3 del ensayo no es una captura certificada del
cuerpo instalado en producción. Antes de una operación real deben contrastarse
esas fuentes con el preestado autorizado, además de respaldo, rol y ejecutor.
