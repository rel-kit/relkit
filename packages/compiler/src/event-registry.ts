import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import type { EventRegistryGenerationOptions } from "./event-registry.types.js";
export type { EventRegistryGenerationOptions } from "./event-registry.types.js";
import { relative, resolve } from "node:path";
import { normalizeSourcePath } from "@relkit/contracts";
import type { ExtractedDescriptor } from "./discovery/extract.js";

export const EVENT_REGISTRY_FILE = "event-registry.d.ts";

/**
 * Renders event contract imports and registry declarations.
 * @param descriptors - Ordered normalized descriptors.
 * @param options - Caller-supplied configuration for this operation.
 * @returns A lazy effect that renders event contract imports and registry declarations; unexpected access failures remain defects.
 */
export const generateEventRegistryEffect = Effect.fn("Compiler.generateEventRegistry")(
  function* (descriptors: readonly ExtractedDescriptor[], options: EventRegistryGenerationOptions) {
    const root = resolve(options.projectRoot);
    const output = resolve(root, options.generatedDirectory ?? ".relkit/generated");
    const seen = new Set<string>();
    const entries = descriptors
      .filter(({ descriptor }) => descriptor.kind === "event")
      .sort(
        (left, right) =>
          left.descriptor.id.localeCompare(right.descriptor.id) ||
          left.reference.module.localeCompare(right.reference.module) ||
          left.exportName.localeCompare(right.exportName),
      )
      .flatMap((entry) => {
        if (seen.has(entry.descriptor.id)) return [];
        seen.add(entry.descriptor.id);
        const module = importPath(output, root, entry.reference.module);
        return [
          `    readonly ${JSON.stringify(entry.descriptor.id)}: typeof import(${JSON.stringify(module)})[${JSON.stringify(entry.exportName)}];`,
        ];
      });
    return [
      "declare global {",
      "  namespace Relkit {",
      "    interface EventRegistry {",
      ...entries,
      "    }",
      "  }",
      "}",
      "",
      "export {};",
      "",
    ].join("\n");
  },
  (effect, descriptors, options) =>
    observeCompiler("generation", "generateEventRegistry", effect, () => ({
      descriptors: descriptors.length,
    })),
);

/**
 * Renders event contract imports and registry declarations.
 * @param descriptors - Ordered normalized descriptors.
 * @param options - Caller-supplied configuration for this operation.
 * @returns Generated TypeScript source declaring the event registry.
 */
export function generateEventRegistry(
  descriptors: readonly ExtractedDescriptor[],
  options: EventRegistryGenerationOptions,
): string {
  return runCompilerSync(generateEventRegistryEffect(descriptors, options));
}

/**
 * Computes a portable relative import between generated output and authored source.
 * @param output - Generated output filename.
 * @param root - Canonical root used for path resolution.
 * @param module - Authored source module path.
 * @returns A POSIX relative import specifier with the required module extension.
 */
function importPath(output: string, root: string, module: string): string {
  const source = resolve(root, normalizeSourcePath(module, root));
  const path = relative(output, source)
    .replaceAll("\\", "/")
    .replace(/\.(?:[cm]?ts|tsx)$/, ".js");
  return path.startsWith(".") ? path : `./${path}`;
}
