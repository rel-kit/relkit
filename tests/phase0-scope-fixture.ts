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
    [`packages/relkit/src/app/${descriptorKind}-api.ts`]: `export const value = ${forbiddenDescriptor};\n`,
    [forbiddenSource]: "export {};\n",
    "examples/commerce/src/lib.rs": "fn main() {}\n",
    "templates/not-approved/README.md": "# invalid template\n",
    "packages/relkit/src/app/persistence-api.ts": `export const value = ${forbiddenApi};\n`,
    "packages/relkit/src/app/internal-import.ts": `export const value = "${internalPackage}";\n`,
    "packages/relkit/src/app/graph-kind.ts": `export const value = ${graphKind};\n`,
    "packages/relkit/src/app/navigation.ts": `export const value = ${navigation};\n`,
    "packages/relkit/src/app/error-code.ts": 'export const code = "PERSISTENCE";\n',
    "packages/relkit/src/app/upper-navigation.ts": `export ${upperNavigation};\n`,
    "packages/relkit/src/app/template.ts": `export const value = ${template};\n`,
    "packages/relkit/src/app/iac.ts": `export const value = ${alternateIac};\n`,
    "examples/commerce/src/persistence.ts": "export {};\n",
  };
  const expected: ScopeScenario["expected"] = [
    ["packages/not-approved/src/index.ts", "out-of-scope-package"],
    [`packages/relkit/src/app/${descriptorKind}-api.ts`, `${descriptorKind}-primitive`],
    [forbiddenSource, `${descriptorKind}-source`],
    ["examples/commerce/src/lib.rs", "rust-source"],
    ["templates/not-approved/README.md", "out-of-scope-template-name"],
    ["packages/relkit/src/app/persistence-api.ts", "out-of-scope-api"],
    ["packages/relkit/src/app/internal-import.ts", "out-of-scope-package"],
    ["packages/relkit/src/app/graph-kind.ts", "out-of-scope-graph-name"],
    ["packages/relkit/src/app/navigation.ts", "out-of-scope-navigation-name"],
    ["packages/relkit/src/app/upper-navigation.ts", "out-of-scope-navigation-name"],
    ["packages/relkit/src/app/template.ts", "out-of-scope-template-name"],
    ["packages/relkit/src/app/iac.ts", "alternate-iac"],
    ["examples/commerce/src/persistence.ts", "out-of-scope-navigation-name"],
  ];
  return { files, expected };
}
