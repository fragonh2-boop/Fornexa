import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

/**
 * El catálogo de códigos de la §3.1 de la especificación WMS es la fuente única para la
 * implementación (F3) y para el plan de pruebas (F5). Si un código se usa sin estar
 * definido, los tests fallan sobre algo que nadie especificó. Este test impide que la
 * lista se desincronice otra vez, que es exactamente lo que pasó con el plan E2E.
 */

const DOC = resolve(import.meta.dirname, "../docs/architecture/wms-fase2-20261017.md");
const raw = readFileSync(DOC, "utf8");

const catalogueStart = raw.indexOf("### 3.1 Catálogo cerrado");
const catalogueEnd = raw.indexOf("## 4. Catálogo de parámetros");
assert.ok(catalogueStart > 0 && catalogueEnd > catalogueStart, "no se encontró la sección del catálogo");

const catalogueSection = raw.slice(catalogueStart, catalogueEnd);
const rest = raw.slice(0, catalogueStart) + raw.slice(catalogueEnd);

const codes = (text: string) => new Set([...text.matchAll(/`(WMS_[A-Z_]+)`/g)].map((match) => match[1]));

const defined = codes(catalogueSection);
// Nombres antiguos citados a propósito en la nota de renombrado ("antes `WMS_X`").
const renamedOnPurpose = new Set([
  "WMS_RECEIPT_NOT_CHECKED",
  "WMS_MIXED_LOT_FORBIDDEN",
  "WMS_LABEL_SCAN_MISMATCH",
]);

test("todo código WMS_* usado en la especificación está definido en el catálogo", () => {
  assert.ok(defined.size >= 25, `el catálogo parece vacío: ${defined.size}`);
  const undefinedCodes = [...codes(rest)].filter((code) => !defined.has(code));
  assert.deepEqual(undefinedCodes, [], `códigos usados sin definir: ${undefinedCodes.join(", ")}`);
});

test("toda fila del catálogo declara su caso de prueba o lo marca explícitamente sin caso", () => {
  // Un código sin caso asociado es o un caso que falta en F5 o una fila de más.
  const rows = catalogueSection
    .split("\n")
    .filter((line) => /^\|\s*`WMS_[A-Z_]+`/.test(line));
  assert.ok(rows.length >= 25, `filas del catálogo: ${rows.length}`);

  for (const row of rows) {
    const cells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
    const code = cells[0];
    const caseCell = cells[cells.length - 1];
    assert.ok(caseCell && caseCell.length > 0, `${code} no declara caso de prueba`);
    assert.match(caseCell, /^(REJ-\d+|SEC|—|-|\(\w+\))/, `${code}: caso no reconocido («${caseCell}»)`);
  }
});

test("el vocabulario de estados es único: los nombres antiguos solo viven en la nota que los corrige", () => {
  const violating = raw
    .split("\n")
    .filter((line) => /(?<![A-Z_])(UNCHECKED_STAGING|CHECKED_STAGING)(?![A-Z_])/.test(line))
    .filter((line) => !line.trimStart().startsWith(">"));   // las notas explicativas empiezan por «>»
  assert.deepEqual(violating, [], `nombres antiguos fuera de una nota: ${violating.join(" | ")}`);

  const located = raw
    .split("\n")
    .filter((line) => /flow_state\s*=\s*'LOCATED'/.test(line))
    .filter((line) => !line.trimStart().startsWith(">"));   // la nota que lo niega no cuenta
  assert.deepEqual(located, [], "flow_state='LOCATED' no es un valor válido: el canónico es STORED");
});

test("los tres renombrados y los cuatro códigos adoptados del plan E2E están presentes", () => {
  for (const code of ["WMS_HU_NOT_CHECKED", "WMS_LOT_MIX_FORBIDDEN", "WMS_LABEL_MISMATCH"]) {
    assert.ok(defined.has(code), `falta el renombrado ${code}`);
  }
  for (const code of [
    "WMS_CROSS_WAREHOUSE_INVALID",
    "WMS_INSUFFICIENT_STOCK",
    "WMS_INSUFFICIENT_PICK_STOCK",
    "WMS_REPLENISHMENT_PENDING",
  ]) {
    assert.ok(defined.has(code), `falta el código adoptado ${code}`);
  }
});
