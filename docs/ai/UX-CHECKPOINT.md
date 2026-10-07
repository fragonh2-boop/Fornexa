# UX y paridad de Preview — checkpoint de implementación

Fecha: 2026-10-08 (CEST). Responsable: FornexaGPT. Estado: **PR draft actualizada, no integrada ni desplegada en producción**.

Última verificación: `046813d3bab92cd232141ac69fb4226ce20af8fc`, 122 archivos sobre main. 195/195 tests, types, lint (0 errores / 7 advertencias), build y gate de memorándum PASS en worktree temporal limpio; CI validate success (run 37700048442), Preview READY exacta y alias de rama sin error. Este checkpoint posterior cambia el HEAD: comprobar CI/Preview final y usar el nuevo SHA en ambas revisiones. Código funcional sin cambios adicionales; se actualiza únicamente documentación y cobertura pública.

Bloqueo de cierre: autorización específica de acceso privado Preview solicitada a Fran, sin cambios de protección; sesión DeepSeek legítima o ampliación explícita del bridge por bloques, también consultada. Claude Desktop no mostró recepción y su ventana no admite interacción en el control disponible. No inferir que alguna IA esté trabajando. FornexaGPT es responsable de reanudar con el candidato conservado cuando se resuelva el acceso; no tocar trabajo ajeno ni hacer merge con gates incompletos.

- Base verificada: `origin/main` `85d34e05d33efe2639cdca46f56c69d310a7403a`.
- Worktree aislado: rama local `codex/ux-production-parity`, remota `codex/preview-demo-screens`, PR #91 contra main. Candidato anterior `764b167c0d06ad09ef59f71a83ce6d6128d3c417` sustituye la demo reducida rechazada y tiene CI/Preview verdes. Correcciones posteriores invalidan esos gates para el siguiente HEAD.
- Riesgo: **HIGH**, por compartir presentaciones productivas y añadir acceso público exclusivamente a Preview. Se requieren Claude y DeepSeek independientes sobre el HEAD final, CI y prueba visual real.
- Autoridad: Fran autorizó implementación, coordinación, merge y deploy. No autoriza saltar autenticación, tocar datos de negocio para probar ni omitir gates.

## Criterios de aceptación

1. Mismo shell, menú de 15 módulos, navegación y componentes de pantalla que producción. Sin portada reducida ni listas alternativas.
2. `/demo` solo se habilita con entorno servidor `VERCEL_ENV=preview` y opt-in explícito. Producción, entorno desconocido y configuración pública alternativa fallan cerrados. Solo GET/HEAD; no cache ni indexación.
3. Datos estáticos ficticios, guardas antes de toda API/storage y ninguna sesión, clave, QR o firma oficial inventada. Formularios validan y simulan sin persistencia.
4. Loaders reales, autenticación, filtros tenant y contratos de escritura preservados. Sin cambios SQL ni a estilos de impresión CMR.
5. Contraste AA y prueba real de navegación, textos largos, ceros/null, errores, retorno de formularios, escritorio y móvil. Los tests de fuente no sustituyen evidencia visual.
6. Types, lint, tests, build y diff-check sobre la fuente final; dictámenes exact-HEAD sin MUST pendientes, CI correcto; después merge y producción READY del commit integrado más comprobación de alias/runtime. Preview no equivale a producción.

## Evidencia parcial

- Evaluaciones de Gemini contrastadas con código. Evaluación original de paridad: NO CUMPLE, solo fuente; no aprobación visual.
- El CSS oscuro de Servicios no tiene importadores en main; la ruta redirige a Clientes. Hallazgo descartado como superficie activa.
- Candidato anterior: suite **184/184 PASS**, `pnpm typecheck` PASS, build final PASS con red autorizada, lint global PASS con 0 errores y 7 advertencias. Nuevas correcciones: 11/11 tests de selección de cliente CMR y contexto de empresa PASS; suite anterior a la última comprobación de relación CMR 194/194 PASS. Types/lint/build del nuevo candidato en curso, no aprobados sin terminal.
- HTTP local: 15 rutas de menú y 7 destinos secundarios responden 200 en demo. Build servido con `VERCEL_ENV=production` y flag demo=1 responde 404 en `/demo`, Artículos y Nueva partida; POST `/demo` en Preview responde 405 con Allow GET/HEAD. Esto es evidencia local, no despliegue.
- Prueba visual local: Control Tower, Artículos y Aduanas conservan el shell completo; textos largos y campos renderizados. Una navegación del navegador integrado agotó la espera y se recuperó en otra pestaña, no se contó como PASS. Quedan prueba visual desplegada, móvil y flujos interactivos.
- Vercel: Preview del SHA anterior READY; 30/30 GET (15 módulos y 15 destinos secundarios) responden 200 con no-store/noindex, shell completo y sin enlaces a dashboard. Esto no verifica hidratación, geometría ni clicks. Acceso visual protegido: la creación de enlace privado temporal fue rechazada por falta de autorización específica; permiso de una hora solicitado a Fran, sin cambios de protección.
- Claude, DeepSeek y Gemini recibieron las solicitudes Slack y devolvieron FALLIDA en sus hilos con el mismo SLACK_REQUEST_TS. Ninguna aprobación. Reproducción local del bridge disponible: prompt 547.386 bytes frente a límite 500.000, proveedor no invocado; SHA runtime no comprobado. MODE manual/source con PR vuelve al diff completo, no permite filtrar fuentes. Evitar reintentos iguales; alternativa manual independiente en Claude Desktop/DeepSeek web con fuentes completas, base/HEAD y cobertura total. Claude Desktop tiene acceso de lectura al workspace; DeepSeek en el navegador integrado requiere sesión legítima.
- Corrección CMR: producción sigue empezando vacía; selector de clientes activos del tenant, sin endpoint nuevo, bloquea emisión si falla el maestro. Simulación conserva opciones estáticas y no consulta backend. Los tres listados compartidos resuelven contexto de empresa y filtran relaciones pertinentes; sin SQL. Las relaciones UUID-only heredadas de otros loaders quedan como riesgo de integridad no introducido por esta delta: no se comprobó ningún cruce real de datos.
- Cuota: ventana renovada, 2% usado al último control; antes de persistir el candidato anterior estaba al 95%. No consumida ninguna recarga ni modificada automatización. Mantener ciclos cortos y checkpoint exacto.
- Dependencias del lockfile instaladas sin scripts. Instalación offline inicial falló por un tarball ausente; instalación autorizada posterior terminó correctamente.

## Siguiente ciclo

Actualización: `f2001e04086d7a146c2f6787d084eedc312af407` guardado, 122 archivos, 195/195 tests y build PASS, Preview READY. CI falló por dos errores lint: JSX en try/catch del loader CMR y variable reservada del test; corregidos manteniendo error de carga y bloqueo. Typecheck local paralelo al build falló al desaparecer archivos duplicados temporales `.next/* 2.ts`; verificar secuencialmente en el worktree temporal sin caché sincronizada. El intento de enviar revisión a Claude Desktop no ha mostrado recepción y DeepSeek web está sin sesión: no contar encargos ni dictámenes. Todos los gates quedan pendientes sobre el nuevo HEAD.

Conservar el candidato corregido en PR #91 sin duplicar; fijar el SHA nuevo, terminar controles/CI y obtener revisión independiente completa de Claude y DeepSeek (los dictámenes parciales deben declarar inventario y no son aprobación global). Resolver MUST y verificar cobertura de todos los archivos/delta final. Obtener acceso Preview autorizado o sesión legítima, validar escritorio/móvil y flujos simulados sin datos reales. No fusionar mientras falte un gate. Tras merge, construir producción con su entorno propio, verificar READY del commit integrado, alias y runtime, y confirmar demo inaccesible en producción. Eliminar la automatización únicamente después del cierre completo.
