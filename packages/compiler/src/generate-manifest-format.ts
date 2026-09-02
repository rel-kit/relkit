import {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "@relkit/contracts";
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
  application?: string,
  agents: ReadonlyMap<string, string> = new Map(),
  tools: ReadonlyMap<string, string> = new Map(),
  routes: ReadonlyMap<string, string> = new Map(),
  constants: ReadonlyMap<string, string> = new Map(),
  prompts: ReadonlyMap<string, string> = new Map(),
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
    'import runtimeActivationFingerprint from "./runtime-activation.json" with { type: "json" };',
    identityBindings.length > 0
      ? 'import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/app";'
      : "",
    [...functions.values()].some((value) =>
      value.startsWith("__relkit_createGeneratedAgentFunction("),
    )
      ? 'import { createGeneratedAgentFunction as __relkit_createGeneratedAgentFunction } from "@relkit/app";'
      : "",
    [...targets.values()].some((value) => value.startsWith("__relkit_bindFunctionEvents("))
      ? 'import { bindFunctionEvents as __relkit_bindFunctionEvents } from "@relkit/app";'
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
    `export const runtimeIntegrationsPlanReference = { version: ${RUNTIME_INTEGRATION_PLAN_VERSION}, fileName: ${JSON.stringify(RUNTIME_INTEGRATION_PLAN_FILE)}, graphHash: manifestGraphHash } as const;`,
    "export const runtimeManifest = {",
    "  contractVersion: manifestContractVersion,",
    "  generatorVersion: manifestGeneratorVersion,",
    "  graphHash: manifestGraphHash,",
    "  activationFingerprint: runtimeActivationFingerprint,",
    `  functions: ${renderMap(functions)},`,
    `  targets: ${renderMap(targets)},`,
    `  agents: ${renderMap(agents)},`,
    `  tools: ${renderMap(tools)},`,
    `  routes: ${renderMap(routes)},`,
    `  constants: ${renderMap(constants)},`,
    `  prompts: ${renderMap(prompts)},`,
    `  services: ${renderMap(services)},`,
    "  runtimeIntegrationsPlan: runtimeIntegrationsPlanReference,",
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

function importPath(module: string, input: ManifestGenerationInput): string {
  const generated = (input.generatedDirectory ?? ".relkit/generated")
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  const depth = generated.split("/").filter(Boolean).length;
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  const path = `${prefix}${module}`;
  return path.startsWith(".") ? path : `./${path}`;
}
