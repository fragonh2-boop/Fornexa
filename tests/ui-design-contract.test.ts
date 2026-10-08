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

test("priority screen titles consume the shared desktop scale", () => {
  for (const [file, selector] of [
    ["app/dashboard/articulos/products.module.css", ".header h1"],
    ["app/dashboard/clientes/customers.module.css", ".page header h1"],
    ["app/dashboard/expediciones/expediciones.module.css", ".header h1"],
    ["app/dashboard/epod-cmr/cmr.module.css", ".header h1"],
    ["app/dashboard/importar/import.module.css", ".header h1"],
    ["app/dashboard/aduanas/customs.module.css", ".header h1"],
    ["app/dashboard/integraciones/integraciones.module.css", ".header h1"],
    ["app/dashboard/integraciones/telematica/telematica.module.css", ".header h1"],
    ["app/dashboard/registros/[module]/[id]/record.module.css", ".content header h1"],
    ["app/dashboard/[module]/module.module.css", ".header h1"],
    ["app/dashboard/decision-center/decision-center.module.css", ".header h1"],
  ]) assert.equal(rule(file, selector).get("font-size"), "var(--ui-title-size)", file);
});

test("desktop KPI column counts follow actual contents, not a blanket four-column rule", () => {
  const cases = [
    ["app/dashboard/expediciones/expediciones.module.css", "app/dashboard/expediciones/ExpedicionesListView.tsx", 4],
    ["app/dashboard/epod-cmr/cmr.module.css", "app/dashboard/epod-cmr/CmrListView.tsx", 3],
    ["app/dashboard/integraciones/telematica/telematica.module.css", "app/dashboard/integraciones/telematica/TelematicsHubView.tsx", 5],
    ["app/dashboard/decision-center/decision-center.module.css", "app/dashboard/decision-center/DecisionCenterView.tsx", 4],
  ] as const;
  for (const [cssFile, componentFile, count] of cases) {
    const component = source(componentFile);
    const section = component.match(/<section className=\{styles\.metrics\}>([\s\S]*?)<\/section>/);
    assert.ok(section, `${componentFile}: missing metrics section`);
    assert.equal(section[1].match(/<article[\s>]/g)?.length, count, componentFile);
    assert.match(rule(cssFile, ".metrics").get("grid-template-columns") ?? "", new RegExp(`^repeat\\(${count},`), cssFile);
    assert.match(source(cssFile), /@media\(max-width:/, `${cssFile}: responsive rules required`);
  }
});

test("targeted controls retain explicit focus and readable disabled states", () => {
  for (const file of [
    "app/dashboard/importar/import.module.css", "app/dashboard/aduanas/customs.module.css",
    "app/dashboard/registros/[module]/[id]/record.module.css", "app/dashboard/articulos/products.module.css",
    "app/dashboard/integraciones/integraciones.module.css",
    "app/dashboard/[module]/module.module.css", "app/dashboard/decision-center/decision-center.module.css",
  ]) {
    const css = source(file);
    assert.match(css, /:focus-visible\{outline:2px solid var\(--ui-focus\)/, file);
    assert.match(css, /:disabled\{[^}]*color:var\(--ui-muted\)/, file);
  }
});

test("generic lists and Decision Center consume the same avatar, panel and metric dimensions", () => {
  for (const [file, metricSelector, buttonSelector] of [
    ["app/dashboard/[module]/module.module.css", ".stats strong", ".primaryLink"],
    ["app/dashboard/decision-center/decision-center.module.css", ".metrics b", ".headerActions button"],
  ]) {
    const avatar = rule(file, ".avatar");
    assert.equal(avatar.get("width"), "var(--ui-avatar-size)", file);
    assert.equal(avatar.get("height"), "var(--ui-avatar-size)", file);
    const panel = rule(file, ".panel");
    assert.equal(panel.get("padding"), "var(--ui-panel-padding)", file);
    assert.equal(panel.get("border-radius"), "var(--ui-panel-radius)", file);
    assert.equal(rule(file, metricSelector).get("font-size"), "var(--ui-metric-size)", file);
    const button = rule(file, buttonSelector);
    assert.equal(button.get("padding"), "var(--ui-button-padding)", file);
    assert.equal(button.get("border-radius"), "var(--ui-button-radius)", file);
    assert.doesNotMatch(source(file), /!important/, `${file}: scoped contracts do not need forced overrides`);
    assert.match(source(file), /@media\(max-width:760px\)/, `${file}: mobile layout required`);
  }
  assert.match(rule("app/dashboard/[module]/module.module.css", ".stats").get("grid-template-columns") ?? "", /^repeat\(3,/);
});

test("Decision Center priorities and route states use readable status pairs", () => {
  for (const [file, selector, foreground, background] of [
    ["app/dashboard/decision-center/decision-center.module.css", ".critica", "--ui-error", "--ui-error-soft"],
    ["app/dashboard/decision-center/decision-center.module.css", ".alta", "--ui-warning", "--ui-warning-soft"],
    ["app/dashboard/decision-center/route-planning.module.css", ".ok", "--ui-success", "--ui-success-soft"],
    ["app/dashboard/decision-center/route-planning.module.css", ".warn", "--ui-warning", "--ui-warning-soft"],
    ["app/dashboard/decision-center/route-planning.module.css", ".blocked", "--ui-error", "--ui-error-soft"],
  ]) {
    const props = rule(file, selector);
    assert.equal(props.get("color"), `var(${foreground})`, selector);
    assert.equal(props.get("background"), `var(${background})`, selector);
  }
  const file = "app/dashboard/decision-center/decision-center.module.css";
  for (const [selector, foreground] of [[".metrics .okText", "--ui-success"], [".metrics .warnText", "--ui-warning"], [".metrics .blockText", "--ui-error"]]) {
    assert.equal(rule(file, selector).get("color"), `var(${foreground})`, selector);
  }
  assert.equal(rule("app/dashboard/decision-center/route-planning.module.css", ".routeHead>span").get("color"), "var(--ui-muted)");
});
