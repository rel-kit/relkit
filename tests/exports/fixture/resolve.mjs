import { readFile } from "node:fs/promises";

const expected = JSON.parse(await readFile(new URL("./expected-exports.json", import.meta.url)));

for (const [packageName, exports] of Object.entries(expected)) {
  for (const [subpath, target] of Object.entries(exports)) {
    const specifier = subpath === "." ? packageName : `${packageName}${subpath.slice(1)}`;
    const importTarget = typeof target === "string" ? target : target.import;
    const resolved = await import.meta.resolve(specifier);
    if (!importTarget || !resolved.endsWith(importTarget.slice(1))) {
      throw new Error(`Unexpected package entry for ${specifier}: ${resolved}`);
    }
    await import(specifier);
  }

  for (const internalPath of ["src/index.ts", "dist/index.js"]) {
    const specifier = `${packageName}/${internalPath}`;
    try {
      await import(specifier);
    } catch (error) {
      if (error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
        continue;
      }
      throw error;
    }
    throw new Error(`Deep import unexpectedly resolved: ${specifier}`);
  }
}

console.log("Export smoke passed: packed entries resolved; internal paths rejected.");
