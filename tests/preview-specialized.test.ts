import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function assertBefore(text: string, earlier: string, later: string) {
  const first = text.indexOf(earlier);
  const second = text.indexOf(later);
  assert.ok(first >= 0, `missing ${earlier}`);
  assert.ok(second >= 0, `missing ${later}`);
  assert.ok(first < second, `${earlier} must precede ${later}`);
}

test("Decision Center and telematics reuse the same presentation in both namespaces", () => {
  for (const [real, demo, view] of [["app/dashboard/decision-center/page.tsx", "app/demo/decision-center/page.tsx", "DecisionCenterView"], ["app/dashboard/integraciones/telematica/page.tsx", "app/demo/integraciones/telematica/page.tsx", "TelematicsHubView"]]) {
    assert.match(source(real), new RegExp(`<${view}\\b`));
    assert.match(source(demo), new RegExp(`<${view}\\b`));
    assert.match(source(demo), /basePath="\/demo" simulation/);
    assert.doesNotMatch(source(demo), /getAuthenticated|createSupabase|getProviderReadiness|fetch\(|localStorage|process\.env/);
  }
  assert.doesNotMatch(source("app/dashboard/decision-center/DecisionCenterView.tsx"), /fetch\(|localStorage|getAuthenticated|createSupabase|process\.env/);
  assert.doesNotMatch(source("app/dashboard/integraciones/telematica/TelematicsHubView.tsx"), /fetch\(|getProviderReadiness|process\.env/);
  assert.match(source("app/dashboard/integraciones/telematica/page.tsx"), /const readiness = getProviderReadiness\(\);/);
  const decision = source("app/dashboard/decision-center/DecisionCenterView.tsx");
  const telematics = source("app/dashboard/integraciones/telematica/TelematicsHubView.tsx");
  assert.doesNotMatch(decision + telematics, /href=["']\/dashboard/);
  assert.doesNotMatch(decision + telematics, /href=\{`\/dashboard\//);
  assert.match(decision, /href=\{`\$\{basePath\}\/integraciones\/telematica`\}/);
  assert.match(telematics, /href=\{`\$\{basePath\}\/decision-center`\}/);
  assert.match(telematics, /href=\{`\$\{basePath\}\/integraciones`\}/);
  assert.match(decision, /!data \? <article/);
});

test("integrations retain the shared screen and simulator never calls external services", () => {
  for (const page of ["app/dashboard/integraciones/page.tsx", "app/demo/integraciones/page.tsx"]) assert.match(source(page), /<IntegracionesClient data=/);
  const client = source("app/dashboard/integraciones/IntegracionesClient.tsx");
  assert.doesNotMatch(client, /href=["']\/dashboard|fetch\(|localStorage|process\.env/);
  assert.match(client, /href=\{basePath\}/);
  assert.match(client, /<EmailWorkspace simulation=\{simulation\} initialHistory=\{emailHistory\}/);
  assert.doesNotMatch(source("app/components/SimulationButton.tsx"), /fetch\(|localStorage|sessionStorage|process\.env|\/api\//);
});

test("simulated email does not load browser history, send email or persist its result", () => {
  const email = source("app/dashboard/integraciones/EmailWorkspace.tsx");
  const effect = email.slice(email.indexOf("useEffect(() => {"), email.indexOf("function storeHistory"));
  assertBefore(effect, "if (simulation) return;", "localStorage.getItem");
  assert.match(email, /if \(!simulation\) localStorage\.setItem\(/);
  const send = email.slice(email.indexOf("async function send("), email.indexOf("return <section"));
  assertBefore(send, "if (simulation)", "fetch(\"/api/communications/email\"");
  assertBefore(send, "return;", "fetch(\"/api/communications/email\"");
  assert.match(send, /status: "Simulado"/);
  const attachments = email.slice(email.indexOf("async function addAttachments("), email.indexOf("async function send("));
  assertBefore(attachments, "if (simulation)", "files.map(fileToAttachment)");
  assertBefore(attachments, "return;", "files.map(fileToAttachment)");
  assert.match(source("app/demo/integraciones/page.tsx"), /basePath="\/demo" simulation emailHistory=/);
});

test("specialized demo fixtures are synthetic and never read configured provider state", () => {
  const fixtures = source("lib/preview-demo-specialized.ts");
  assert.doesNotMatch(fixtures, /getProviderReadiness|process\.env|fetch\(|localStorage|supabase|auth-context/);
  assert.match(fixtures, /configured: false/);
  assert.match(fixtures, /eventsToday: "0"/);
  assert.match(fixtures, /mappings: \[\]/);
  assert.match(fixtures, /sourceCount: 0/);
  for (const match of fixtures.matchAll(/(?:expedition|vehicle|id): "([^"]+)"/g)) assert.ok(match[1].startsWith("DEMO-"), match[1]);
  assert.match(fixtures, /destinatario@example\.invalid/);
});
