import { GENERATOR_VERSION, MANIFEST_VERSION } from "@relkit/contracts";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import type { ImportBinding } from "./generate-manifest-utils.js";

export function renderManifest(
  input: ManifestGenerationInput,
  bindings: ReadonlyMap<string, ImportBinding>,
  functions: ReadonlyMap<string, string>,
  targets: ReadonlyMap<string, string>,
  middleware: ReadonlyMap<string, string>,
  hooks: ReadonlyMap<string, string>,
  transforms: ReadonlyMap<string, string>,
  providers: readonly string[],
  application?: string,
  agents: ReadonlyMap<string, string> = new Map(),
  tools: ReadonlyMap<string, string> = new Map(),
  routes: ReadonlyMap<string, string> = new Map(),
  constants: ReadonlyMap<string, string> = new Map(),
  prompts: ReadonlyMap<string, string> = new Map(),
  dataModel?: string,
  services: ReadonlyMap<string, string> = new Map(),
  identityBindings: readonly string[] = [],
): string {
  const imports = [...bindings.values()]
    .map(
      ({ alias, module }) =>
        `import * as ${alias} from ${JSON.stringify(importPath(module, input))};`,
    )
    .join("\n");
  const generatedImports = [
    identityBindings.length > 0
      ? 'import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/invocation";'
      : "",
    [...functions.values()].some((value) =>
      value.startsWith("__relkit_createGeneratedAgentFunction("),
    )
      ? 'import { createGeneratedAgentFunction as __relkit_createGeneratedAgentFunction } from "@relkit/agents";'
      : "",
    [...targets.values()].some((value) => value.startsWith("__relkit_createEventListenerTarget("))
      ? 'import { createEventListenerTarget as __relkit_createEventListenerTarget } from "@relkit/events";'
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  return [
    [generatedImports, imports].filter(Boolean).join("\n"),
    ...(generatedImports !== "" || imports !== "" ? [""] : []),
    ...identityBindings,
    ...(identityBindings.length > 0 ? [""] : []),
    `export const manifestContractVersion = ${MANIFEST_VERSION} as const;`,
    `export const manifestGeneratorVersion = ${GENERATOR_VERSION} as const;`,
    `export const manifestGraphHash = ${JSON.stringify(input.graphHash)} as const;`,
    `export const providerFactories = ${renderProviders(providers)} as const;`,
    "export const runtimeManifest = {",
    "  contractVersion: manifestContractVersion,",
    "  generatorVersion: manifestGeneratorVersion,",
    "  graphHash: manifestGraphHash,",
    `  functions: ${renderMap(functions)},`,
    `  targets: ${renderMap(targets)},`,
    `  agents: ${renderMap(agents)},`,
    `  tools: ${renderMap(tools)},`,
    `  routes: ${renderMap(routes)},`,
    `  constants: ${renderMap(constants)},`,
    `  prompts: ${renderMap(prompts)},`,
    ...(dataModel === undefined ? [] : [`  dataModel: ${dataModel},`]),
    `  services: ${renderMap(services)},`,
    "  providers: providerFactories,",
    "  providerFactories,",
    `  middleware: ${renderMap(middleware)},`,
    `  hooks: ${renderMap(hooks)},`,
    `  requestTransforms: ${renderMap(transforms)},`,
    ...(application === undefined ? [] : [`  application: ${application},`]),
    "} as const;",
    "",
  ].join("\n");
}

function renderMap(values: ReadonlyMap<string, string>): string {
  const entries = [...values.entries()].sort(([left], [right]) => left.localeCompare(right));
  return `{ ${entries.map(([key, value]) => `${JSON.stringify(key)}: ${value}`).join(", ")} }`;
}

function renderProviders(keys: readonly string[]): string {
  return `{ ${keys
    .map((key) => {
      const separator = key.indexOf(":");
      const capability = key.slice(0, separator);
      const adapter = key.slice(separator + 1);
      return `${JSON.stringify(key)}: { capability: ${JSON.stringify(capability)}, adapter: ${JSON.stringify(adapter)}, factory: undefined }`;
    })
    .join(", ")} }`;
}

function importPath(module: string, input: ManifestGenerationInput): string {
  const generated = (input.generatedDirectory ?? ".relkit/generated")
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  const depth = generated.split("/").filter(Boolean).length;
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  const path = `${prefix}${module}`;
  return path.startsWith(".") ? path : `./${path}`;
}
