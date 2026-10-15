import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { siteCopy, fornexaModules } from "../app/components/site-copy.ts";

const source = (relPath: string) => readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");

/** Una ruta existe si tiene page.tsx propio en app/. Las dinámicas no cuentan. */
const routeHasPage = (href: string) => {
  const [path] = href.split("#");
  if (path === "/") return existsSync(new URL("../app/page.tsx", import.meta.url));
  return existsSync(new URL(`../app${path}/page.tsx`, import.meta.url));
};

test("public surfaces only link to routes that actually render", () => {
  for (const language of Object.keys(siteCopy) as (keyof typeof siteCopy)[]) {
    for (const surface of siteCopy[language].surfaces.items) {
      if (!surface.href) continue;
      assert.ok(
        routeHasPage(surface.href),
        `surface '${surface.label}' links to ${surface.href}, which has no page.tsx`,
      );
    }
  }
});

test("public module links resolve and never point at the preview-gated demo", () => {
  for (const platformModule of fornexaModules) {
    assert.ok(
      routeHasPage(platformModule.href),
      `module '${platformModule.name}' links to ${platformModule.href}, which has no page.tsx`,
    );
  }
  for (const file of [
    "app/HomeView.tsx",
    "app/plataforma/PlatformView.tsx",
    "app/contacto/ContactView.tsx",
    "app/components/SiteChrome.tsx",
  ]) {
    assert.doesNotMatch(source(file), /href=["']\/demo/, `${file} links to /demo, which returns 404 off Preview`);
  }
});

test("public copy does not reuse another vendor's product names", () => {
  const copy = source("app/components/site-copy.ts");
  for (const borrowed of ["eCRM", "ePODs", "BI by AI", "Smart Blockchain", "Smart Solutions", "Tesisquare", "TESI TMS"]) {
    assert.ok(!copy.includes(borrowed), `borrowed product name '${borrowed}' must not appear`);
  }
});

test("public pages declare their own metadata", () => {
  for (const route of ["app/page.tsx", "app/plataforma/page.tsx", "app/contacto/page.tsx"]) {
    assert.match(source(route), /export const metadata/, `${route} must export metadata`);
  }
});

test("the platform page declares real status, not only capabilities", () => {
  const view = source("app/plataforma/PlatformView.tsx");
  assert.match(view, /t\.status\.live/);
  assert.match(view, /t\.status\.preparing/);
});
