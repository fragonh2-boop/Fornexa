import AppShell from "../../../components/AppShell";
import TripForm, { type DriverOption, type ExpeditionOption, type VehicleOption } from "./TripForm";

export default function NewTripView({ expeditions, vehicles, drivers, readOnly = false, simulation = false, basePath = "/dashboard" }: {
  expeditions: ExpeditionOption[]; vehicles: VehicleOption[]; drivers: DriverOption[];
  readOnly?: boolean; simulation?: boolean; basePath?: "/dashboard" | "/demo";
}) {
  return <AppShell><div style={{ maxWidth: 1100, margin: "0 auto" }}>
    <header style={{ marginBottom: 24 }}>
      <p style={{ margin: 0, color: "#0067ad", fontSize: 11, fontWeight: 800, letterSpacing: ".12em" }}>TRANSPORTE</p>
      <h1 style={{ margin: "7px 0 0", fontSize: 42, lineHeight: 1.05 }}>Nuevo viaje</h1>
    </header>
    <TripForm expeditions={expeditions} vehicles={vehicles} drivers={drivers} readOnly={readOnly} simulation={simulation} basePath={basePath} />
  </div></AppShell>;
}
