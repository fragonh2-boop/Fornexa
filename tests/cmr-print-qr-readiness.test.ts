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
  assert.ok(page.includes("El QR no se ha podido cargar. Reinténtalo; si el acceso ha caducado, genera uno nuevo antes de imprimir o exportar."));
  assert.ok(page.includes('qrState==="error"?"QR no disponible":"Preparando QR"'));
  assert.match(styles, /\.qrPending\{visibility:hidden\}/);
  assert.match(styles, /\.qrNotice\{[^}]*color:#a33a2b!important/);
});

test("CMR QR failures can retry a fresh resource without weakening the print gate", () => {
  assert.ok(page.includes('[qrAttempt,setQrAttempt]=useState(0)'));
  assert.ok(page.includes('attempt=${qrAttempt}'));
  assert.ok(page.includes('setQrAttempt(attempt=>attempt+1)'));
  assert.ok(page.includes('onClick={retryQr}>Reintentar QR</button>'));
  assert.ok(page.includes('onClick={printDocument} disabled={qrState!=="ready"}'));
  assert.ok(page.includes('onClick={exportPdf} disabled={qrState!=="ready"}'));
});

test("loaded QR remains part of the dedicated A4 print surface", () => {
  assert.match(styles, /@media print\{[\s\S]*?\.documentNumber img\{[^}]*width:10mm;height:10mm/);
  assert.match(styles, /@page\{size:A4 portrait;margin:9mm\}/);
  assert.match(styles, /@media print\{[\s\S]*?\.paper\{[^}]*width:192mm[^}]*min-height:279mm[^}]*display:flex;flex-direction:column/);
  assert.ok(page.includes('className={styles.qrStatus}'));
  assert.doesNotMatch(styles, /@media print\{[\s\S]*?\.qrStatus\{[^}]*display:none/);
});

test("CMR print geometry fills one A4 page when content fits and never clips oversized content", () => {
  assert.match(styles, /@media print\{[\s\S]*?\.paper\{[^}]*min-height:279mm;[^}]*height:auto;[^}]*max-height:none;[^}]*overflow:visible/);
  assert.doesNotMatch(styles, /@media print\{[\s\S]*?\.paper\{[^}]*overflow:hidden/);
  assert.match(styles, /@media print\{[\s\S]*?\.adrBox\{[^}]*max-height:none;overflow:visible/);
  assert.match(styles, /@media print\{[\s\S]*?\.goodsRow\{[^}]*break-inside:avoid;page-break-inside:avoid/);
  assert.match(styles, /@media print\{[\s\S]*?\.signatures\{[^}]*break-inside:avoid;page-break-inside:avoid/);
});

test("CMR goods use a repeatable table header with document identity on continuation pages", () => {
  assert.ok(page.includes('<table className={styles.goods}><thead>'));
  assert.ok(page.includes('<tr className={styles.goodsIdentity}><th scope="colgroup" colSpan={7}>CMR {cmr} · Mercancías</th></tr>'));
  assert.ok(page.includes('<tr className={styles.goodsHead}><th scope="col">6 Marcas y números</th>'));
  assert.ok(page.includes('<tbody>{doc.goodsLines.map((line,index)=><tr className={styles.goodsRow}'));
  assert.match(styles, /@media print\{[\s\S]*?\.goods thead\{display:table-header-group\}/);
  assert.match(styles, /@media print\{[\s\S]*?\.goodsIdentity\{display:table-row\}/);
  assert.match(styles, /\.goods\{[^}]*table-layout:fixed/);
});

test("CMR print geometry keeps the balanced layout and anchors signatures near the bottom", () => {
  assert.match(styles, /@media print\{[\s\S]*?\.gridTwo\{[^}]*flex:5 1 0;grid-auto-rows:minmax\(18mm,1fr\)/);
  assert.match(styles, /@media print\{[\s\S]*?\.gridTwoBottom\{[^}]*flex:2 1 0;grid-auto-rows:minmax\(18mm,1fr\)/);
  assert.match(styles, /@media print\{[\s\S]*?\.signatures\{[^}]*flex:0 0 32mm/);
  assert.match(styles, /@media print\{[\s\S]*?\.signatureState\{[^}]*margin-top:auto/);
});

test("CMR signature boxes use canonical party roles and never stamp FORNEXA as the sender", () => {
  assert.ok(page.includes('canonicalSignatures=Array.isArray(result.canonical?.signatures)?result.canonical.signatures:[]'));
  assert.ok(page.includes('firmaExpedidor:signatureStatus(canonicalSignatures,"sender",item.sender)'));
  assert.ok(page.includes('firmaTransportista:signatureStatus(canonicalSignatures,"carrier",item.carrier)'));
  assert.ok(page.includes('firmaDestinatario:signatureStatus(canonicalSignatures,"consignee",item.recipient)'));
  assert.ok(page.includes('<strong>{doc.remitente}</strong><br/>{doc.remitenteDireccion}<br/>{doc.firmaExpedidor}'));
  assert.ok(page.includes('<strong>{doc.transportista}</strong><br/>{doc.firmaTransportista}'));
  assert.doesNotMatch(page, /companyMaster\.cmrStamp/);
  assert.doesNotMatch(page, /Firma electrónica registrada en trazabilidad/);
});
