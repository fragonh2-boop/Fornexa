import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const logo = readFileSync("app/components/FornexaLogo.tsx", "utf8");
const loginCss = readFileSync("app/login/login.css", "utf8");
const dashboardCss = readFileSync("app/dashboard/layout.module.css", "utf8");

test("FORNEXA login logo leaves intrinsic SVG room for font fallback variance", () => {
  assert.match(logo, /viewBox="10 0 400 170"/);
  assert.match(logo, /overflow="visible"/);
  assert.match(logo, /fontFamily="Arial, Helvetica, sans-serif"/);
});

test("login brand wrappers never reintroduce SVG clipping", () => {
  assert.match(loginCss, /\.login-brand-logo\s*\{[\s\S]*?overflow:\s*visible;/);
  assert.doesNotMatch(loginCss, /\.login-brand-logo(?:\s+svg)?\s*\{[\s\S]*?overflow:\s*hidden;/);
});

test("known high-risk print chrome remains excluded from CMR output", () => {
  assert.match(dashboardCss, /@media\s+print[\s\S]*?\.sidebar\s*\{[\s\S]*?display:\s*none\s*!important;/);
});
