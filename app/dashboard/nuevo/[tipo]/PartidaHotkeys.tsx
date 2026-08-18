"use client";

import { useEffect } from "react";

const PARTIDAS_STORE = "fornexa-partidas";
const BACK_URL = "/dashboard/partidas";

function keepButton() {
  return document.querySelector<HTMLButtonElement>('form button[type="submit"][name="saveMode"][value="keep"]');
}

export default function PartidaHotkeys() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || (event.key !== "F2" && event.key !== "F4")) return;
      const button = keepButton();
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.key === "F4") {
        button.click();
        return;
      }

      const before = localStorage.getItem(PARTIDAS_STORE);
      button.click();
      window.setTimeout(() => {
        const after = localStorage.getItem(PARTIDAS_STORE);
        if (after !== before) window.location.assign(BACK_URL);
      }, 0);
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  return null;
}
