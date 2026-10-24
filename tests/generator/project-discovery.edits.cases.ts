/** Retains original edits assertions for project-discovery, registered by the owning suite. */
import { expect } from "bun:test";
import {
  ADD_FAILURE_CODES,
  addFactoryObjectMember,
  addSourceExport,
  addSourceImport,
} from "../../packages/cli/src/scaffolding/index.ts";
export function case4Edits() {
  const service = `import { defineService } from "@relkit/app/services";\n\nexport default defineService({ functions: { hello } });\n`;
  const imported = addSourceImport(service, "service.ts", `import added from "./added.js";`);
  const edited = addFactoryObjectMember(
    imported,
    "service.ts",
    ["defineService"],
    ["functions"],
    "added",
    "added",
  );
  expect(edited).toContain(`import added from "./added.js";`);
  expect(edited).toContain("functions: { hello, added }");
  expect(addSourceImport(imported, "service.ts", `import added from "./added.js";`)).toBe(imported);
  expect(
    addFactoryObjectMember(
      edited,
      "service.ts",
      ["defineService"],
      ["functions"],
      "added",
      "added",
    ),
  ).toBe(edited);
  const merged = addSourceImport(
    `// keep this byte-for-byte\n${service}`,
    "service.ts",
    `import { type ServiceDescriptor } from "@relkit/app/services";`,
  );
  expect(merged).toStartWith("// keep this byte-for-byte\n");
  expect(merged).toContain("{ defineService, type ServiceDescriptor }");
  assertUnsafeServiceEdits(service, edited);
  assertPlatformInsertions();
}

/** Retains each rejection assertion for malformed or unsupported service source. */
function assertUnsafeServiceEdits(service: string, edited: string) {
  expect(service.replace("\n\n", "\n...mixins,\n")).not.toBe(edited);
  expect(() =>
    addSourceImport(`import {`, "service.ts", `import added from "./added.js";`),
  ).toThrow();
  expect(() =>
    addFactoryObjectMember(
      `defineService({ ...shared })`,
      "service.ts",
      ["defineService"],
      [],
      "functions",
      "functions: {}",
    ),
  ).toThrow();
  try {
    addFactoryObjectMember(
      `defineService(options)`,
      "service.ts",
      ["defineService"],
      [],
      "functions",
      "functions: {}",
    );
  } catch (error) {
    expect(error).toMatchObject({ code: ADD_FAILURE_CODES.unsupportedSourceShape });
  }
}
/** Retains byte-preserving app, export and environment insertion assertions. */
function assertPlatformInsertions() {
  const app = `export default defineApp({\n  env,\n});\n`;
  const withCache = addFactoryObjectMember(
    app,
    "relkit.config.ts",
    ["defineApp"],
    [],
    "cache",
    "cache: { local: redis() }",
  );
  expect(withCache).toContain("cache: { local: redis() }");
  expect(
    addSourceExport("export const items = {};\n", "schema.ts", `export * from "./auth.js";`),
  ).toEndWith(`export * from "./auth.js";\n`);
  expect(
    addFactoryObjectMember(
      withCache,
      "relkit.config.ts",
      ["defineApp"],
      ["defaults"],
      "cache",
      `cache: "local"`,
    ),
  ).toContain(`defaults: { cache: "local" }`);
  expect(
    addFactoryObjectMember(
      `export default defineEnv({});\n`,
      "src/platform/env.ts",
      ["defineEnv"],
      [],
      "TOKEN",
      `TOKEN: env.secret("TOKEN")`,
    ),
  ).toContain(`TOKEN: env.secret("TOKEN")`);
}
