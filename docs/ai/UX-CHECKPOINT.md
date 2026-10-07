# UX y paridad de Preview — checkpoint de implementación

Fecha: 2026-10-07. Responsable: FornexaGPT. Estado: **en implementación, no integrado ni desplegado**.

- Base verificada: `origin/main` `85d34e05d33efe2639cdca46f56c69d310a7403a`.
- Worktree aislado: rama `codex/ux-production-parity`. La PR #91 conserva la demo anterior rechazada; no es una aprobación de esta implementación.
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
- Suite completa: **184/184 PASS**. `pnpm typecheck` PASS. Build completo PASS con red autorizada; tras el margen final de Artículos y el memorándum se repite para el candidato final. Lint global sigue sin resultado terminal: no se da por aprobado.
- HTTP local: 15 rutas de menú y 7 destinos secundarios responden 200 en demo. Build servido con `VERCEL_ENV=production` y flag demo=1 responde 404 en `/demo`, Artículos y Nueva partida; POST `/demo` en Preview responde 405 con Allow GET/HEAD. Esto es evidencia local, no despliegue.
- Prueba visual local: Control Tower, Artículos y Aduanas conservan el shell completo; textos largos y campos renderizados. Una navegación del navegador integrado agotó la espera y se recuperó en otra pestaña, no se contó como PASS. Quedan prueba visual desplegada, móvil y flujos interactivos.
- Uso Codex verificado al 95% de la ventana de cinco horas. Persistir candidato y delegar la validación externa antes de agotar la cuota; ninguna delegación sustituye los gates.
- Dependencias del lockfile instaladas sin scripts. Instalación offline inicial falló por un tarball ausente; instalación autorizada posterior terminó correctamente.

## Siguiente ciclo

Terminar los adaptadores simulados, comprobar todas las rutas de menú/formularios, ejecutar controles centralizados, actualizar memorándum/handoff y PR #91 sin duplicar ni importar delta vieja sin revisión. Fijar HEAD para Claude/DeepSeek. No fusionar mientras falte un gate. Tras merge, construir producción con su entorno propio y verificar el SHA desplegado y el dominio.
