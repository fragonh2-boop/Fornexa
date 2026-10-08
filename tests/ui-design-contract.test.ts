import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = new Map<string, string>();
function source(file: string): string {
  if (!sources.has(file)) sources.set(file, readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
  return sources.get(file)!;
}
const globals = source("app/globals.css");
const tokens = new Map([...globals.matchAll(/(--ui-[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));

function rule(file: string, selector: string): Map<string, string> {
  const fullCss = source(file).replace(/\/\*[\s\S]*?\*\//g, "");
  const css = fullCss.split("@media")[0];
  const properties = new Map<string, string>();
  let found = false;
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!match[1].split(",").map(value => value.trim()).includes(selector)) continue;
    found = true;
    for (const value of match[2].split(";").filter(Boolean)) {
      const colon = value.indexOf(":");
      assert.ok(colon > 0, `${file}: invalid declaration in ${selector}`);
      properties.set(value.slice(0, colon).trim(), value.slice(colon + 1).trim());
    }
  }
  assert.ok(found, `${file}: missing selector ${selector}`);
  return properties;
}

function luminance(hex: string): number {
  assert.match(hex, /^#[\da-f]{6}$/i);
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("the screen contract follows the Control Tower dimensions and palette", () => {
  const expected = {
    "--ui-page-bg": "#eef3f9", "--ui-surface": "#ffffff", "--ui-text": "#101216",
    "--ui-accent": "#005d8f", "--ui-title-size": "42px", "--ui-eyebrow-size": "11px",
    "--ui-eyebrow-spacing": ".15em", "--ui-button-radius": "10px",
    "--ui-button-padding": "14px 19px", "--ui-panel-radius": "17px",
    "--ui-panel-padding": "24px", "--ui-avatar-size": "42px", "--ui-metric-size": "38px",
  };
  for (const [key, value] of Object.entries(expected)) assert.equal(tokens.get(key), value, key);
});

test("screen text, button and status token pairs pass AA for normal text", () => {
  const pairs = [
    ["--ui-text", "--ui-surface"], ["--ui-muted", "--ui-surface"],
    ["--ui-muted", "--ui-surface-subtle"], ["--ui-surface", "--ui-accent"],
    ["--ui-accent", "--ui-accent-soft"], ["--ui-success", "--ui-success-soft"],
    ["--ui-warning", "--ui-warning-soft"], ["--ui-error", "--ui-error-soft"],
  ];
  for (const [foreground, background] of pairs) {
    const fg = tokens.get(foreground);
    const bg = tokens.get(background);
    assert.ok(fg && bg, `missing ${foreground} or ${background}`);
    assert.ok(contrast(fg, bg) >= 4.5, `${foreground} on ${background} must reach 4.5:1`);
  }
});

test("record, import and customs inputs use visible text on light surfaces", () => {
  for (const [file, selector] of [
    ["app/dashboard/registros/[module]/[id]/record.module.css", ".card input"],
    ["app/dashboard/importar/import.module.css", ".mapping select"],
    ["app/dashboard/aduanas/customs.module.css", ".filters input"],
    ["app/dashboard/aduanas/customs.module.css", ".modal select option"],
  ]) {
    const props = rule(file, selector);
    assert.equal(props.get("color"), "var(--ui-text)", `${file} ${selector}`);
    assert.equal(props.get("background"), "var(--ui-surface)", `${file} ${selector}`);
  }
});

test("email feedback and integration codes consume readable status tokens", () => {
  const file = "app/dashboard/integraciones/integraciones.module.css";
  for (const [selector, foreground, background] of [
    [".emailNotice", "--ui-success", "--ui-success-soft"],
    [".emailError", "--ui-error", "--ui-error-soft"],
    [".badge.pendiente", "--ui-warning", "--ui-warning-soft"],
    [".badge.error", "--ui-error", "--ui-error-soft"],
  ]) {
    const props = rule(file, selector);
    assert.equal(props.get("color"), `var(${foreground})`, selector);
    assert.equal(props.get("background"), `var(${background})`, selector);
  }
  assert.equal(rule(file, ".mappingRow code").get("color"), "var(--ui-accent)");
  assert.equal(rule("app/dashboard/integraciones/telematica/telematica.module.css", ".fields code").get("color"), "var(--ui-accent)");
});

test("screens that keep their own header consume the shared desktop title scale", () => {
  for (const [file, selector] of [
    ["app/dashboard/importar/import.module.css", ".header h1"],
    ["app/dashboard/registros/[module]/[id]/record.module.css", ".content header h1"],
  ]) assert.equal(rule(file, selector).get("font-size"), "var(--ui-title-size)", file);
});

const sharedChrome = "app/components/screen.module.css";
const moduleScreens = [
  "app/components/ControlTowerView.tsx",
  "app/dashboard/partidas/PartidasListView.tsx",
  "app/dashboard/expediciones/ExpedicionesListView.tsx",
  "app/dashboard/viajes/ViajesListView.tsx",
  "app/dashboard/aduanas/CustomsListView.tsx",
  "app/dashboard/[module]/ModuleView.tsx",
  "app/dashboard/clientes/CustomersListView.tsx",
  "app/dashboard/articulos/ProductCatalog.tsx",
  "app/dashboard/epod-cmr/CmrListView.tsx",
  "app/dashboard/integraciones/IntegracionesClient.tsx",
  "app/dashboard/integraciones/telematica/TelematicsHubView.tsx",
];

test("every module screen renders the shared Control Tower header and KPI cards", () => {
  for (const file of moduleScreens) {
    const component = source(file);
    assert.match(component, /<ScreenHeader\b/, `${file}: shared header`);
    assert.match(component, /<MetricGrid\b/, `${file}: shared KPI cards`);
    assert.doesNotMatch(component, /className=\{styles\.(avatar|metrics|primary|secondary|primaryLink|secondaryLink)\}/, `${file}: no local header chrome`);
    assert.doesNotMatch(component, />FG</, `${file}: avatar comes from ScreenHeader`);
  }
});

test("shared chrome consumes the Control Tower tokens", () => {
  assert.equal(rule(sharedChrome, ".title").get("font-size"), "var(--ui-title-size)");
  assert.equal(rule(sharedChrome, ".eyebrow").get("font-size"), "var(--ui-eyebrow-size)");
  const button = rule(sharedChrome, ".button");
  assert.equal(button.get("padding"), "var(--ui-button-padding)");
  assert.equal(button.get("border-radius"), "var(--ui-button-radius)");
  assert.equal(button.get("white-space"), "nowrap", "action labels never break into two lines");
  assert.equal(rule(sharedChrome, ".primary").get("background"), "var(--ui-accent)");
  assert.equal(rule(sharedChrome, ".secondary").get("background"), "var(--ui-surface)");
  const avatar = rule(sharedChrome, ".avatar");
  assert.equal(avatar.get("width"), "var(--ui-avatar-size)");
  assert.equal(avatar.get("height"), "var(--ui-avatar-size)");
  assert.equal(avatar.get("background"), "#dce7f2");
  const metric = rule(sharedChrome, ".metric");
  assert.equal(metric.get("background"), "linear-gradient(180deg,#f5f7fb,#f8fafc)");
  const value = rule(sharedChrome, ".metricValue");
  assert.equal(value.get("font-size"), "var(--ui-metric-size)");
  assert.equal(value.get("white-space"), "nowrap", "identifiers such as VJ-26000002 never split");
  const panel = rule(sharedChrome, ".panel");
  assert.equal(panel.get("padding"), "var(--ui-panel-padding)");
  assert.equal(panel.get("border-radius"), "var(--ui-panel-radius)");
  assert.match(rule(sharedChrome, ".metrics").get("grid-template-columns") ?? "", /^repeat\(var\(--metric-count,4\),/);
  const css = source(sharedChrome);
  assert.match(css, /\.button:focus-visible[^{]*\{outline:2px solid var\(--ui-focus\)/);
  assert.match(css, /\.button:disabled\{[^}]*color:var\(--ui-muted\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.doesNotMatch(css, /!important/);
});

test("targeted controls retain explicit focus and readable disabled states", () => {
  for (const file of [
    "app/dashboard/importar/import.module.css", "app/dashboard/aduanas/customs.module.css",
    "app/dashboard/registros/[module]/[id]/record.module.css", "app/dashboard/articulos/products.module.css",
    "app/dashboard/integraciones/integraciones.module.css", "app/dashboard/[module]/module.module.css",
  ]) {
    const css = source(file);
    assert.match(css, /:focus-visible\{outline:2px solid var\(--ui-focus\)/, file);
    assert.match(css, /:disabled\{[^}]*color:var\(--ui-muted\)/, file);
  }
});

test("Artículos shows only the grid; creation opens an overlay from the button or the + shortcut", () => {
  const catalog = source("app/dashboard/articulos/ProductCatalog.tsx");
  assert.match(catalog, /\{editorOpen && <div className=\{styles\.overlay\}/);
  assert.match(catalog, /role="dialog" aria-modal="true"/);
  assert.match(catalog, /isPlusShortcut\(event\)/);
  assert.match(catalog, /event\.key === "Escape"/);
  assert.match(catalog, /onClick=\{startNew\}/);
  assert.equal(rule("app/dashboard/articulos/products.module.css", ".overlay").get("position"), "fixed");
});
