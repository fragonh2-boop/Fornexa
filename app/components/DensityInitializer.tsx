import { UI_DENSITY_BOOTSTRAP } from "@/lib/ui-density";

/**
 * Aplica el nivel de densidad guardado antes de que el navegador pinte el
 * cuerpo, para que no haya parpadeo (FOUC) al cargar cualquier módulo.
 *
 * Va como primer hijo de `<body>`: el script en línea se ejecuta durante el
 * análisis del HTML, antes de que se pinte el contenido que viene detrás.
 * No es un componente de cliente porque no necesita hidratación.
 */
export default function DensityInitializer() {
  return <script dangerouslySetInnerHTML={{ __html: UI_DENSITY_BOOTSTRAP }} />;
}
