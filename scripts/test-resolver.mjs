import { pathToFileURL } from "node:url";
import { resolve as pathResolve } from "node:path";
import { existsSync } from "node:fs";

const projectRoot = process.cwd();

function resolveCandidate(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    pathResolve(basePath, "index.ts"),
    pathResolve(basePath, "index.tsx"),
    pathResolve(basePath, "index.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      return pathToFileURL(c).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }
  if (specifier === "next/headers") {
    return nextResolve("next/headers.js", context);
  }
  if (specifier.startsWith("@/")) {
    const candidate = resolveCandidate(pathResolve(projectRoot, specifier.slice(2)));
    if (candidate) {
      return { url: candidate, shortCircuit: true };
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND" && context.parentURL) {
      const parentPath = new URL(context.parentURL).pathname;
      const candidate = resolveCandidate(pathResolve(parentPath, "..", specifier));
      if (candidate) {
        return { url: candidate, shortCircuit: true };
      }
    }
    throw err;
  }
}
