# PR #150: subsanación de conexión y pruebas — 30 octubre 2026

Actualización de integración: Claude aprobó `1bfb534` en 6522812458 (CODE_READY/MERGE SÍ, cero MUST), y #150 se fusionó a main `c948368`, árbol idéntico al revisado. Vercel canónico READY en ese SHA, dominio y smoke200 comprobados. Sin dispatch de captura. La candidata #145 incorpora después defensa en profundidad ante NODE_TLS_REJECT_UNAUTHORIZED=0, prueba negativa y repin: requiere su propio SHA/CI/dictamen; la aprobación de #150 no cubre automáticamente ese delta.

Base revisada: `5f283f5fefe7a8e04470f1756eb8d9b38c566d9b`.
Dictamen independiente: [Claude, 6520568428](https://github.com/fragonh2-boop/Fornexa/pull/150#issuecomment-6520568428).
El dictamen cerró MUST-146-1 y los tres puntos de publicación. Mantiene MERGE y DISPATCH NO por MUST-150-1. Este documento describe una candidata, no una aprobación.

## Cambios

- El CLI utiliza `createAuditClient`, valida el destino permitido y exige TLS con validación de certificado y nombre. No se configuran excepciones, callbacks de identidad ni CA alternativa en producción.
- Se aceptan `sslmode=require`, `verify-ca` y `verify-full` como intención de conexión segura; se retira ese parámetro antes de pasar la URL a pg para que no sustituya el objeto TLS explícito. Todos se ejecutan con validación de cadena y nombre. Los modos débiles o desconocidos se rechazan. Otros parámetros TLS en la URL continúan fuera de la lista permitida.
- El secreto solo se toma de `POSTGRES_URL_NON_POOLING`; se retira el fallback genérico PG y el alias PG del paso Python. Se conserva el nombre del secreto existente para no cambiar su configuración.
- Se aclara el comentario del preflight: el esquema se valida antes de escribir. El preflight saneado sí se conserva si falla después una aserción de negocio sobre discrepancias de tenant; no se publica un workflow fallido.
- Se actualiza el pin del runner. El test recorre imports/exports estáticos, imports dinámicos literales, require y register en el grafo de runner y bootstrap, incluido el generador. Exige pines para todos los módulos locales y rechaza una importación nueva sin pin. node_modules conserva el modelo de confianza del lockfile.
- El positivo de publicación usa salida nueva de `buildMigrationAudit`, con 42 migraciones sintéticas y reloj actual, y comprueba su persistencia sin cuerpos SQL. No reutiliza el fixture 0912 como resultado.

## Pruebas y alcance

`tests/supabase-audit-tls.test.ts` utiliza el Client real de pg y un peer PostgreSQL/TLS desechable en loopback. Solo redirige el socket TCP: se conserva el hostname autorizado que verifica pg. Las dos pruebas negativas rechazan certificado no confiable y certificado confiable con hostname incorrecto, antes del startup PostgreSQL y de la contraseña. El positivo confía exclusivamente en la CA efímera del test, conserva el hostname esperado y completa la autenticación sintética. No utiliza conexión ni credenciales productivas.

`tests/supabase-audit-publication.test.ts` conserva las pruebas negativas de mutación de módulos, campos renombrados y ausencia de archivos tras rechazo, y añade el grafo de imports y el documento generado. Las pruebas relacionales READ ONLY existentes permanecen activas.

Estos ensayos no acreditan el certificado actual del pooler real, conectividad productiva ni ejecución oficial de captura. Si la cadena real no es confiable, la conexión debe fallar: no se reintroducirá un bypass. La captura manual sigue pendiente del cierre independiente sobre el SHA nuevo; no se ha ejecutado.

Referencias primarias consultadas: [node-postgres: TLS y connectionString](https://node-postgres.com/features/ssl), [Supabase: conexiones SSL verificadas](https://supabase.com/docs/guides/database/psql). La advertencia de pg sobre reemplazo del objeto ssl también se contrastó contra el código instalado de ConnectionParameters. No cambian SQL, migraciones, dependencias ni runtime WMS.

Validación local: 39/39 focales (21 de ejecutor/publicación/TLS y 18 de Memorandum/fecha), tipos PASS, lint global 0 errores/10 avisos y build de producción PASS. Suite general 407/408: timeout DATA150 del lock vacío, reproducido antes del delta; no se modifica DATA150. Pendientes: publicación, CI del nuevo SHA y revalidación independiente de Claude. #149 continúa en `ab7e044`, CI #614 verde, sin dictamen nuevo localizado sobre ese SHA.
