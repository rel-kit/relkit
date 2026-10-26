/** Checks shared Node entries and deep rejections, then verifies Bun-only leaves in their native runtime. */
import { readFile } from "node:fs/promises";

const expected = JSON.parse(await readFile(new URL("./expected-exports.json", import.meta.url)));
const bunOnly = process.argv.includes("--bun-only");
if (bunOnly && !process.versions.bun) throw new Error("Bun-only public checks require Bun");

for (const [packageName, exports] of Object.entries(expected)) {
  for (const [subpath, target] of Object.entries(exports)) {
    // The Bun creator owner and unchanged named Bun adapter expose paths for tooling, not Node execution.
    const nativeBunLeaf =
      packageName === "create-relkit" ||
      (packageName === "@relkit/runtime-hono" && subpath === "./bun");
    if (bunOnly && !nativeBunLeaf && (typeof target === "string" || target.bun === undefined))
      continue;
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
