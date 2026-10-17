import {
  ScreenHeader,
  MetricGrid,
  screenPanelClass,
} from "../../components/ScreenChrome";

export default function DemoAlmacenesPage() {
  return (
    <main>
      <ScreenHeader
        eyebrow="WMS · OPERATIVA TRANSACCIONAL"
        title="Almacenes"
        description="Control de zonas, ubicaciones, unidades de manipulación (LPN/SSCC), recepción y chequeo en playa, ubicación dirigida, reservas y picking FEFO/FIFO, y expedición con lectura de etiqueta."
      />
      <MetricGrid
        items={[
          { label: "En playa (sin chequear / OK)", value: "0 / 0" },
          { label: "Pallets ubicados (STORED)", value: "0" },
          { label: "Picking / Expedición", value: "0 / 0" },
          { label: "Quants legado (NULL fail-closed)", value: "0" },
        ]}
      />
      <section className={screenPanelClass}>
        <p>
          Demostración pública sin movimientos de almacén activos. El módulo operativo completo de
          Almacenes (WMS) está disponible en el entorno autenticado.
        </p>
      </section>
    </main>
  );
}
