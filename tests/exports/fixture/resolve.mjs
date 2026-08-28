const packageNames = ["@relkit/app", "@relkit/compiler"];
const appSubpaths = [
  "agents",
  "buckets",
  "cache",
  "config",
  "events",
  "functions",
  "jobs",
  "routes",
  "schema",
  "services",
  "tools",
];

for (const subpath of appSubpaths) {
  const specifier = `@relkit/app/${subpath}`;
  const resolved = await import.meta.resolve(specifier);
  if (!resolved.endsWith(`/dist/${subpath}.js`)) {
    throw new Error(`Unexpected package entry for ${specifier}: ${resolved}`);
  }
  await import(specifier);
}

for (const packageName of packageNames) {
  const resolved = await import.meta.resolve(packageName);
  if (!resolved.endsWith("/dist/index.js")) {
    throw new Error(`Unexpected package entry for ${packageName}: ${resolved}`);
  }

  await import(packageName);

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
