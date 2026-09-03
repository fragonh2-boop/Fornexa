import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardCss = readFileSync("app/dashboard/layout.module.css", "utf8");
const cmrCss = readFileSync("app/dashboard/epod-cmr/[cmr]/cmr-document.module.css", "utf8");

test("dashboard chrome is excluded from printed CMR output", () => {
  assert.match(dashboardCss, /@media\s+print\s*\{/);
  assert.match(dashboardCss, /\.sidebar\s*\{[\s\S]*?display:\s*none\s*!important;/);
  assert.match(dashboardCss, /\.frame\s*\{[\s\S]*?display:\s*block;/);
  assert.match(dashboardCss, /\.stage\s*\{[\s\S]*?overflow:\s*visible;/);
});

test("CMR keeps its dedicated A4 print contract", () => {
  assert.match(cmrCss, /@media\s+print\s*\{/);
  assert.match(cmrCss, /@page\s*\{\s*size:\s*A4 portrait;/);
  assert.match(cmrCss, /\.appHeader\s*\{\s*display:\s*none\s*\}/);
  assert.match(cmrCss, /\.paper\s*\{[\s\S]*?width:\s*204mm;/);
});
