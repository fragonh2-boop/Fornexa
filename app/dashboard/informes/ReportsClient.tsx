"use client";
import { useState } from "react";
import ModuleView from "../[module]/ModuleView";
import DockReports from "../muelles/DockReports";
import { screenButton } from "../../components/ScreenChrome";
export default function ReportsClient() {
  const [tab, setTab] = useState("General");
  return (
    <>
      <nav
        aria-label="Pestañas de informes"
        style={{ display: "flex", gap: 8, marginBottom: 18 }}
      >
        {["General", "Muelles"].map((name) => (
          <button
            type="button"
            key={name}
            className={
              tab === name ? screenButton.primary : screenButton.secondary
            }
            onClick={() => setTab(name)}
            aria-pressed={tab === name}
          >
            {name}
          </button>
        ))}
      </nav>
      {tab === "Muelles" ? (
        <DockReports />
      ) : (
        <ModuleView module="informes" demo={false} />
      )}
    </>
  );
}
