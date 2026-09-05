import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/dashboard/epod-cmr/[cmr]/page.tsx", "utf8");
const styles = readFileSync("app/dashboard/epod-cmr/[cmr]/cmr-document.module.css", "utf8");

test("CMR print waits for the exact QR resource to load", () => {
  assert.ok(page.includes('const qrState=qrStatus?.src===qrSrc?qrStatus.state:"loading"'));
  assert.ok(page.includes('qrState==="ready"&&searchParams.get("print")==="1"'));
  assert.ok(page.includes('if(!doc||!isLive||qrState!=="ready")return'));
  assert.ok(page.includes('onLoad={()=>setQrStatus({src:qrSrc,state:"ready"})}'));
});

test("CMR print fails visibly and cannot export a broken QR", () => {
  assert.ok(page.includes('onError={()=>setQrStatus({src:qrSrc,state:"error"})}'));
  assert.ok(page.includes('disabled={qrState!=="ready"}'));
  assert.ok(page.includes("El acceso QR no está vigente. Renueva la capability antes de imprimir o exportar."));
  assert.ok(page.includes('qrState==="error"?"QR no vigente":"Preparando QR"'));
  assert.match(styles, /\.qrPending\{visibility:hidden\}/);
  assert.match(styles, /\.qrNotice\{[^}]*color:#a33a2b!important/);
});

test("loaded QR remains part of the dedicated A4 print surface", () => {
  assert.match(styles, /@media print\{[\s\S]*?\.documentNumber img\{[^}]*width:10mm;height:10mm/);
  assert.match(styles, /@media print\{[\s\S]*?\.paper\{[^}]*width:204mm[^}]*height:291mm/);
});
