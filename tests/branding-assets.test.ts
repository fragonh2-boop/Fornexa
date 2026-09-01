import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function text(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function pngSize(path: string) {
  const file = await readFile(new URL(`../${path}`, import.meta.url));
  assert.equal(file.subarray(1, 4).toString("ascii"), "PNG");
  return [file.readUInt32BE(16), file.readUInt32BE(20)];
}

test("web logo sources use the rounded canonical mark without clipping", async () => {
  const [component, icon, wordmark] = await Promise.all([
    text("app/components/FornexaLogo.tsx"),
    text("app/icon.svg"),
    text("public/branding/fornexa-wordmark.svg"),
  ]);

  assert.match(component, /viewBox="10 0 378\.33 170"/);
  assert.match(component, /strokeLinecap="round" strokeLinejoin="round"/);
  assert.doesNotMatch(component, /miter|strokeLinecap="butt"/);
  assert.match(icon, /stroke-linecap="round" stroke-linejoin="round"/);
  assert.match(wordmark, /viewBox="10 0 378\.33 170"/);
  assert.match(wordmark, /stroke-linecap="round" stroke-linejoin="round"/);
});

test("login isolates the SVG wordmark from the legacy clipped logo box", async () => {
  const [page, loginStyles] = await Promise.all([
    text("app/login/page.tsx"),
    text("app/login/login.css"),
  ]);

  assert.match(page, /className="login-brand-logo"/);
  assert.doesNotMatch(page, /className="auth-logo"/);
  assert.match(loginStyles, /\.login-brand-logo\s*\{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/);
  assert.match(loginStyles, /\.login-brand-logo svg\s*\{[^}]*width:\s*100%;[^}]*height:\s*auto;/);
});

test("PWA and mobile configurations reference the harmonized assets", async () => {
  const manifest = JSON.parse(await text("public/manifest.webmanifest"));
  const expo = JSON.parse(await text("mobile-driver/app.json"));
  const mobile = await text("mobile-driver/App.tsx");

  assert.equal(manifest.icons[0].src, "/icon.svg");
  assert.equal(expo.expo.icon, "./assets/icon-zen.png");
  assert.equal(expo.expo.android.adaptiveIcon.foregroundImage, "./assets/adaptive-icon.png");
  assert.match(mobile, /require\("\.\/assets\/wordmark-zen\.png"\)/);
});

test("mobile logo exports retain their required canvas dimensions", async () => {
  assert.deepEqual(await pngSize("mobile-driver/assets/icon.png"), [1024, 1024]);
  assert.deepEqual(await pngSize("mobile-driver/assets/icon-zen.png"), [1024, 1024]);
  assert.deepEqual(await pngSize("mobile-driver/assets/adaptive-icon.png"), [1024, 1024]);
  assert.deepEqual(await pngSize("mobile-driver/assets/wordmark-zen.png"), [1100, 300]);
});
