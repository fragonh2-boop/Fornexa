"use client";

import Script from "next/script";

const bridge = `
(() => {
  if (window.__fornexaStorageBridge) return;
  window.__fornexaStorageBridge = true;
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    original.call(this, key, value);
    if (this === window.localStorage && typeof key === "string" && key.startsWith("fornexa-") && key !== "fornexa-local-storage-sync") {
      window.dispatchEvent(new Event("fornexa:local-storage-updated"));
    }
  };
})();`;

export default function LocalStorageSyncBridge() {
  return <Script id="fornexa-local-storage-sync-bridge" strategy="beforeInteractive">{bridge}</Script>;
}
