import {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "@relkit/contracts";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import type { ImportBinding } from "./generate-manifest-utils.js";

/**
 * Renders deterministic imports, identity bindings, and executable manifest registries.
 * @param input - Compiler input and source provenance.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param functions - Executable function descriptors.
 * @param targets - Declared event target bindings.
 * @param middleware - Middleware descriptor or path being compared.
 * @param hooks - Executable lifecycle hook bindings.
 * @param transforms - Transform descriptors participating in generation.
 * @param application - Application descriptor metadata.
 * @param agents - Agent descriptors participating in generation.
 * @param channels - Channel descriptors participating in generation.
 * @param tools - Declared agent tools or normalized tool descriptors.
 * @param routes - Route descriptors participating in generation.
 * @param constants - Constants descriptors participating in generation.
 * @param prompts - Prompt descriptors participating in generation.
 * @param services - Domain services indexed by owning domain identity.
 * @param tasks - Task descriptors participating in generation.
 * @param jobs - Job bindings participating in generation.
 * @param identityBindings - Source identity rebinding statements.
 * @returns Deterministic executable manifest TypeScript source.
 */
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
  channels: ReadonlyMap<string, string> = new Map(),
  tools: ReadonlyMap<string, string> = new Map(),
  routes: ReadonlyMap<string, string> = new Map(),
  constants: ReadonlyMap<string, string> = new Map(),
  prompts: ReadonlyMap<string, string> = new Map(),
  services: ReadonlyMap<string, string> = new Map(),
  tasks: ReadonlyMap<string, string> = new Map(),
  jobs: ReadonlyMap<string, string> = new Map(),
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
    `  channels: ${renderMap(channels)},`,
    `  tools: ${renderMap(tools)},`,
    `  routes: ${renderMap(routes)},`,
    `  constants: ${renderMap(constants)},`,
    `  prompts: ${renderMap(prompts)},`,
    `  services: ${renderMap(services)},`,
    `  tasks: ${renderMap(tasks)},`,
    `  jobs: ${renderMap(jobs)},`,
    "  runtimeIntegrationsPlan: runtimeIntegrationsPlanReference,",
    `  middleware: ${renderMap(middleware)},`,
    `  hooks: ${renderMap(hooks)},`,
    `  requestTransforms: ${renderMap(transforms)},`,
    ...(application === undefined ? [] : [`  application: ${application},`]),
    "} as const;",
    "",
  ].join("\n");
}

/**
 * Renders a readonly executable registry map in insertion order.
 * @param values - Ordered values to inspect without coercion.
 * @returns A readonly registry expression preserving map insertion order.
 */
function renderMap(values: ReadonlyMap<string, string>): string {
  const entries = [...values.entries()].sort(([left], [right]) => left.localeCompare(right));
  return `{ ${entries.map(([key, value]) => `${JSON.stringify(key)}: ${value}`).join(", ")} }`;
}

/**
 * Computes a portable relative import between generated output and authored source.
 * @param module - Authored source module path.
 * @param input - Compiler input and source provenance.
 * @returns A POSIX relative import specifier with the required module extension.
 */
function importPath(module: string, input: ManifestGenerationInput): string {
  const generated = (input.generatedDirectory ?? ".relkit/generated")
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  const depth = generated.split("/").filter(Boolean).length;
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  const path = `${prefix}${module}`;
  return path.startsWith(".") ? path : `./${path}`;
}
