import {
  ScreenHeader,
  MetricGrid,
  screenPanelClass,
} from "../../components/ScreenChrome";
export default function DemoDocksPage() {
  return (
    <main>
      <ScreenHeader eyebrow="PLANIFICACIÓN" title="Muelles" />
      <MetricGrid
        items={[
          { label: "Citas", value: 0 },
          { label: "Puntualidad", value: "—" },
          { label: "Incidencias", value: 0 },
          { label: "Espera media", value: "—" },
        ]}
      />
      <section className={screenPanelClass}>
        <p>
          Demostración sin citas de muelles. El módulo operativo está disponible
          en el entorno autenticado.
        </p>
      </section>
    </main>
  );
}
