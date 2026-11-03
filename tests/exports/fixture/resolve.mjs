/** Checks shared Node entries and deep rejections, then verifies Bun-only leaves in their native runtime. */
import { readFile } from "node:fs/promises";

const expected = JSON.parse(await readFile(new URL("./expected-exports.json", import.meta.url)));
const bunOnly = process.argv.includes("--bun-only");
if (bunOnly && !process.versions.bun) throw new Error("Bun-only public checks require Bun");

for (const [packageName, exports] of Object.entries(expected)) {
  for (const [subpath, target] of Object.entries(exports)) {
    // The Bun creator and CLI and the named Bun adapter expose paths for tooling, not Node execution.
    const nativeBunLeaf =
      packageName === "create-relkit" ||
      packageName === "@relkit/cli" ||
      (packageName === "relkit" && subpath === "./runtime-hono/bun");
    if (bunOnly && !nativeBunLeaf && (typeof target === "string" || target.bun === undefined))
      continue;
    // A require-only entry, such as the CLI's editor plugin, is not an ESM import target.
    if (typeof target !== "string" && !target.import && !target.default && !target.bun) continue;
    const specifier = subpath === "." ? packageName : `${packageName}${subpath.slice(1)}`;
    let importTarget = target;
    if (typeof target !== "string") {
      importTarget = target.import ?? target.default;
      if (process.versions.bun && target.bun !== undefined) importTarget = target.bun;
      if (!process.versions.bun && target.bun !== undefined && importTarget === undefined) {
        await rejectImport(specifier);
        continue;
      }
    }
    const resolved = await import.meta.resolve(specifier);
    if (!importTarget || !resolved.endsWith(importTarget.slice(1))) {
      throw new Error(`Unexpected package entry for ${specifier}: ${resolved}`);
    }
    if (nativeBunLeaf && !process.versions.bun) continue;
    await import(specifier);
  }

  if (bunOnly) continue;
  for (const internalPath of ["src/index.ts", "dist/index.js"]) {
    const specifier = `${packageName}/${internalPath}`;
    await rejectImport(specifier);
  }
}

if (!bunOnly && expected.relkit?.["."]) {
  // Applications import core APIs from the root and from focused subpaths that share one identity.
  const core = await import("relkit");
  const events = await import("relkit/events");
  if (typeof core.defineFunction !== "function" || typeof core.defineService !== "function")
    throw new Error("relkit must export defineFunction and defineService from its root");
  if (events.defineEvent !== core.defineEvent)
    throw new Error("relkit/events must export the same defineEvent as the root");
}

if (bunOnly) console.log("Export smoke passed: Bun-only public entries resolved.");
else console.log("Export smoke passed: packed entries resolved; internal paths rejected.");

/** Requires the native export-map rejection, preserving other import failures. */
async function rejectImport(specifier) {
  try {
    await import(specifier);
  } catch (error) {
    if (error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") return;
    throw error;
  }
  throw new Error(`Unsupported import unexpectedly resolved: ${specifier}`);
}
