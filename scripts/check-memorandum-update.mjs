import { execFileSync } from "node:child_process";

const NULL_SHA = /^0+$/;
const memorandumPath = "lib/memorandum.ts";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function resolveRange() {
  let [base, head = "HEAD"] = process.argv.slice(2);
  if (!base || NULL_SHA.test(base)) {
    base = git("rev-parse", `${head}^`);
  }
  return { base, head };
}

function requiresMemorandum(path) {
  return (
    /^(app|lib|mobile-driver|supabase\/migrations)\//.test(path) ||
    /^(package\.json|pnpm-lock\.yaml|next\.config\.[^/]+|vercel\.json)$/.test(path)
  ) && path !== memorandumPath;
}

const { base, head } = resolveRange();
const changed = git("diff", "--name-only", base, head).split("\n").filter(Boolean);
const impactful = changed.filter(requiresMemorandum);

if (impactful.length === 0) {
  console.log("Memorandum gate: no functional change detected.");
  process.exit(0);
}

if (!changed.includes(memorandumPath)) {
  console.error("Memorandum gate failed: functional changes require lib/memorandum.ts in the same change.");
  console.error(impactful.map((path) => ` - ${path}`).join("\n"));
  process.exit(1);
}

console.log(`Memorandum gate passed: ${impactful.length} functional file(s) and ${memorandumPath} changed.`);
