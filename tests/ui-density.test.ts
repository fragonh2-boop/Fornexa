import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_UI_DENSITY,
  UI_DENSITIES,
  UI_DENSITY_ATTRIBUTE,
  UI_DENSITY_BOOTSTRAP,
  UI_DENSITY_OPTIONS,
  UI_DENSITY_STORAGE_KEY,
  UI_DENSITY_TOKENS,
  applyUiDensity,
  normalizeUiDensity,
} from "../lib/ui-density.ts";

const source = (relPath: string) => readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");

/** Extrae el cuerpo de la primera regla cuyo selector contenga `selector`. */
function ruleBody(css: string, selector: string) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const index = clean.indexOf(selector);
  assert.ok(index >= 0, `no se encontró el selector ${selector}`);
  const open = clean.indexOf("{", index);
  const close = clean.indexOf("}", open);
  return clean.slice(open + 1, close);
}

// --- Comportamiento del núcleo -------------------------------------------------

test("densidad: todo valor ausente o desconocido cae al nivel por defecto", () => {
  assert.equal(DEFAULT_UI_DENSITY, "compact");
  assert.deepEqual([...UI_DENSITIES], ["comfortable", "standard", "compact"]);
  for (const input of [undefined, null, "", "Comfortable", "dense", 7, {}, []]) {
    assert.equal(normalizeUiDensity(input), "compact", `entrada inválida: ${String(input)}`);
  }
  for (const valid of UI_DENSITIES) {
    assert.equal(normalizeUiDensity(valid), valid);
  }
});

test("densidad: se aplica como atributo en la raíz del documento", () => {
  const written: Record<string, string> = {};
  const root = { setAttribute: (name: string, value: string) => { written[name] = value; } };

  assert.equal(applyUiDensity("comfortable", root), "comfortable");
  assert.equal(written[UI_DENSITY_ATTRIBUTE], "comfortable");

  assert.equal(applyUiDensity("no-existe", root), DEFAULT_UI_DENSITY);
  assert.equal(written[UI_DENSITY_ATTRIBUTE], DEFAULT_UI_DENSITY);
});

test("densidad: el script anti-FOUC aplica el nivel guardado antes de pintar", () => {
  const run = (stored: string | null, options: { blocked?: boolean } = {}) => {
    const attributes: Record<string, string> = {};
    const fakeDocument = {
      documentElement: { setAttribute: (name: string, value: string) => { attributes[name] = value; } },
    };
    const fakeStorage = {
      getItem: () => {
        if (options.blocked) throw new Error("almacenamiento bloqueado");
        return stored;
      },
    };
    new Function("localStorage", "document", UI_DENSITY_BOOTSTRAP)(fakeStorage, fakeDocument);
    return attributes[UI_DENSITY_ATTRIBUTE];
  };

  assert.match(UI_DENSITY_BOOTSTRAP, /fornexa-ui-density/);
  assert.equal(run(null), "compact", "sin valor guardado debe aplicar el compacto");
  assert.equal(run("comfortable"), "comfortable");
  assert.equal(run("compact"), "compact");
  assert.equal(run("valor-corrupto"), "compact", "un valor corrupto no debe romper el arranque");
  assert.equal(run(null, { blocked: true }), "compact", "si localStorage falla, falla cerrado al compacto");
});

// --- Contrato de estilos y navegación -----------------------------------------

test("densidad: los tres niveles declaran todos los tokens en globals.css", () => {
  const css = source("app/globals.css");
  for (const density of UI_DENSITIES) {
    const body = ruleBody(css, `html[${UI_DENSITY_ATTRIBUTE}="${density}"]`);
    for (const token of UI_DENSITY_TOKENS) {
      assert.match(body, new RegExp(`${token}\\s*:`), `el nivel ${density} no declara ${token}`);
    }
  }
});

test("densidad: el panel de Interfaz existe y está registrado en Configuración", () => {
  const client = source("app/dashboard/integraciones/IntegracionesClient.tsx");
  assert.match(client, /"Interfaz"/, "falta la pestaña Interfaz");
  assert.match(client, /<InterfaceConfigWorkspace \/>/, "la pestaña no renderiza el panel");

  const workspace = source("app/dashboard/integraciones/InterfaceConfigWorkspace.tsx");
  assert.match(workspace, /saveUiDensity/, "el panel debe persistir el nivel");
  assert.match(workspace, /resetUiDensity/, "el panel debe poder restablecer");
  assert.match(workspace, /UI_DENSITY_OPTIONS/, "el panel debe leer el catálogo de niveles");

  const library = source("lib/ui-density.ts");
  for (const option of UI_DENSITY_OPTIONS) {
    assert.match(library, new RegExp(option.label), `falta la opción ${option.label} en el catálogo`);
  }
});

test("densidad: la preferencia no se sincroniza como dato de empresa", () => {
  const migration = source("lib/local-storage-migration.ts");
  assert.match(migration, /fornexa-ui-density/, "la clave debe estar clasificada como presentación");
});

// --- Correcciones de scroll y sticky ------------------------------------------

test("scroll: la raíz del panel no recorta el viewport de las cabeceras sticky", () => {
  const body = ruleBody(source("app/dashboard/layout.module.css"), ".stage {");
  assert.match(body, /overflow:\s*visible/, "el escenario debe permitir sticky");
  assert.doesNotMatch(body, /overflow:\s*clip/, "un recorte aquí anula position: sticky");
  assert.match(body, /overflow-y:\s*visible|overflow:\s*visible/);
});

test("scroll: la página no oculta el desbordamiento horizontal y usa el token de padding", () => {
  const body = ruleBody(source("app/components/screen.module.css"), ".pageContent{");
  assert.doesNotMatch(body, /overflow-x:\s*hidden/, "overflow-x hidden rompe el sticky y oculta la barra");
  assert.match(body, /padding:var\(--ui-page-padding/);
});

test("scroll: la tabla contiene su propio scroll y mantiene visible la cabecera", () => {
  const css = source("app/components/DataGrid.module.css");
  const wrap = ruleBody(css, ".tableWrap{");
  assert.match(wrap, /max-height:calc\(100vh/, "sin tope de altura la barra horizontal queda al pie");
  assert.match(wrap, /overflow:auto/, "la tabla necesita su propio contenedor de scroll");
  assert.match(wrap, /scrollbar-width:thin/, "conviene una barra fina y accesible");
  assert.match(ruleBody(css, ".head{"), /position:sticky/);
});

test("densidad: las celdas y la cabecera de tabla se escalan por token", () => {
  const css = source("app/components/DataGrid.module.css");
  const cell = ruleBody(css, ".cell{");
  assert.match(cell, /min-height:var\(--ui-grid-cell-height/);
  assert.match(cell, /padding:var\(--ui-grid-cell-padding/);
  assert.match(cell, /tabular-nums/, "las cifras deben alinearse en columna");
  assert.match(ruleBody(css, ".headerCell{"), /min-height:var\(--ui-grid-header-height/);
});

test("densidad: el título del dashboard deja de estar fijado a 42px", () => {
  const css = source("app/dashboard/layout.module.css");
  assert.doesNotMatch(css, /font-size:\s*42px\s*!important/, "el título debe escalar con la densidad");
  assert.match(css, /font-size:\s*var\(--ui-title-size\)\s*!important/);
});

test("densidad: el arranque se monta en el layout raíz", () => {
  const layout = source("app/layout.tsx");
  assert.match(layout, /import DensityInitializer/);
  assert.match(layout, /<DensityInitializer \/>/);
  const initializer = source("app/components/DensityInitializer.tsx");
  assert.match(initializer, /UI_DENSITY_BOOTSTRAP/);
});

test("densidad: la clave de almacenamiento es la acordada", () => {
  assert.equal(UI_DENSITY_STORAGE_KEY, "fornexa-ui-density");
  assert.equal(UI_DENSITY_ATTRIBUTE, "data-density");
});
