/** Builds original negative scope tokens and exact diagnostic expectations without performing I/O or introducing application APIs. */
import type { Files, ScopeScenario } from "./phase0-harness.types.js";

/** Constructs pure original scope exclusions, preserving deliberately split forbidden tokens.
 * @returns Exact source inputs and expected path/rule pairs. */
export function scopeFixture(): ScopeScenario {
  const persistence = ["persis", "tence"].join("");
  const plugin = ["plu", "gin"].join("");
  const descriptorKind = ["sub", "scription"].join("");
  const forbiddenDescriptor = ["define", "Sub", "scription"].join("");
  const forbiddenSource = `examples/commerce/src/events.${descriptorKind}.ts`;
  const forbiddenApi = ["define", "Pers", "istence"].join("");
  const internalPackage = ["@relkit/", persistence].join("");
  const graphKind = [`nodeKind: "`, persistence, `"`].join("");
  const navigation = [`const path = "/`, persistence, `"`].join("");
  const upperNavigation = [`const path = "/`, persistence.toUpperCase(), `"`].join("");
  const template = [`template: "`, plugin, `"`].join("");
  const alternateIac = ["terra", "form"].join("");
  const files: Files = {
    "packages/not-approved/src/index.ts": "export {};\n",
    [`packages/app/src/${descriptorKind}-api.ts`]: `export const value = ${forbiddenDescriptor};\n`,
    [forbiddenSource]: "export {};\n",
    "examples/commerce/src/lib.rs": "fn main() {}\n",
    "templates/not-approved/README.md": "# invalid template\n",
    "packages/app/src/persistence-api.ts": `export const value = ${forbiddenApi};\n`,
    "packages/app/src/internal-import.ts": `export const value = "${internalPackage}";\n`,
    "packages/app/src/graph-kind.ts": `export const value = ${graphKind};\n`,
    "packages/app/src/navigation.ts": `export const value = ${navigation};\n`,
    "packages/app/src/error-code.ts": 'export const code = "PERSISTENCE";\n',
    "packages/app/src/upper-navigation.ts": `export ${upperNavigation};\n`,
    "packages/app/src/template.ts": `export const value = ${template};\n`,
    "packages/app/src/iac.ts": `export const value = ${alternateIac};\n`,
    "examples/commerce/src/persistence.ts": "export {};\n",
  };
  const expected: ScopeScenario["expected"] = [
    ["packages/not-approved/src/index.ts", "out-of-scope-package"],
    [`packages/app/src/${descriptorKind}-api.ts`, `${descriptorKind}-primitive`],
    [forbiddenSource, `${descriptorKind}-source`],
    ["examples/commerce/src/lib.rs", "rust-source"],
    ["templates/not-approved/README.md", "out-of-scope-template-name"],
    ["packages/app/src/persistence-api.ts", "out-of-scope-api"],
    ["packages/app/src/internal-import.ts", "out-of-scope-package"],
    ["packages/app/src/graph-kind.ts", "out-of-scope-graph-name"],
    ["packages/app/src/navigation.ts", "out-of-scope-navigation-name"],
    ["packages/app/src/upper-navigation.ts", "out-of-scope-navigation-name"],
    ["packages/app/src/template.ts", "out-of-scope-template-name"],
    ["packages/app/src/iac.ts", "alternate-iac"],
    ["examples/commerce/src/persistence.ts", "out-of-scope-navigation-name"],
  ];
  return { files, expected };
}
