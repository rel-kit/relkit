import { canonicalJson, GENERATOR_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import type { NormalizedDescriptor } from "./normalize-types.js";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import type { ImportBinding } from "./generate-manifest-utils.js";
import { referenceId } from "./generate-manifest-utils.js";

export function renderManifest(
  input: ManifestGenerationInput,
  bindings: ReadonlyMap<string, ImportBinding>,
  functions: ReadonlyMap<string, string>,
  targets: ReadonlyMap<string, string>,
  middleware: ReadonlyMap<string, string>,
  transforms: ReadonlyMap<string, string>,
  middlewareDescriptors: readonly NormalizedDescriptor[],
  providers: readonly string[],
  application?: string,
  agents: ReadonlyMap<string, string> = new Map(),
  tools: ReadonlyMap<string, string> = new Map(),
): string {
  const imports = [...bindings.values()]
    .map(
      ({ alias, module }) =>
        `import * as ${alias} from ${JSON.stringify(importPath(module, input))};`,
    )
    .join("\n");
  const generatedImports = [
    [...functions.values()].some((value) =>
      value.startsWith("__zsys_createGeneratedAgentFunction("),
    )
      ? 'import { createGeneratedAgentFunction as __zsys_createGeneratedAgentFunction } from "@zsys/agents";'
      : "",
    [...targets.values()].some((value) => value.startsWith("__zsys_createEventListenerTarget("))
      ? 'import { createEventListenerTarget as __zsys_createEventListenerTarget } from "@zsys/events";'
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const middlewareDeclarations = middlewareDescriptors
    .map((descriptor, index) => {
      const targetId = referenceId(descriptor.value) ?? "";
      const target = functions.get(targetId) ?? "undefined";
      return `const __zsys_middleware_${index} = Object.assign((...args: any[]) => (${target} as (...values: any[]) => any)(...args), { targetFunctionId: ${JSON.stringify(targetId)}, request: ${recordValue(descriptor.value, "request")}, decision: ${recordValue(descriptor.value, "decision")} });`;
    })
    .join("\n");
  return [
    [generatedImports, imports].filter(Boolean).join("\n"),
    ...(generatedImports !== "" || imports !== "" ? [""] : []),
    `export const manifestContractVersion = ${MANIFEST_VERSION} as const;`,
    `export const manifestGeneratorVersion = ${GENERATOR_VERSION} as const;`,
    `export const manifestGraphHash = ${JSON.stringify(input.graphHash)} as const;`,
    `export const providerFactories = ${renderProviders(providers)} as const;`,
    ...(middlewareDeclarations === "" ? [] : [middlewareDeclarations]),
    "export const runtimeManifest = {",
    "  contractVersion: manifestContractVersion,",
    "  generatorVersion: manifestGeneratorVersion,",
    "  graphHash: manifestGraphHash,",
    `  functions: ${renderMap(functions)},`,
    `  targets: ${renderMap(targets)},`,
    `  agents: ${renderMap(agents)},`,
    `  tools: ${renderMap(tools)},`,
    "  providers: providerFactories,",
    "  providerFactories,",
    `  middleware: ${renderMap(middleware)},`,
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

function renderProviders(tags: readonly string[]): string {
  return `{ ${tags
    .map(
      (tag) => `${JSON.stringify(tag)}: { recipeTag: ${JSON.stringify(tag)}, factory: undefined }`,
    )
    .join(", ")} }`;
}

function importPath(module: string, input: ManifestGenerationInput): string {
  const generated = (input.generatedDirectory ?? ".zsys/generated")
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  const depth = generated.split("/").filter(Boolean).length;
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  const path = `${prefix}${module}`;
  return path.startsWith(".") ? path : `./${path}`;
}

function recordValue(value: unknown, key: string): string {
  const record = isRecord(value) ? value[key] : undefined;
  try {
    return canonicalJson(record ?? null);
  } catch {
    return "null";
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
