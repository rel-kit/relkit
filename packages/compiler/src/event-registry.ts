import { relative, resolve } from "node:path";
import { normalizeSourcePath } from "@zsys/contracts";
import type { ExtractedDescriptor } from "./discovery/extract.js";

export const EVENT_REGISTRY_FILE = "event-registry.d.ts";

export interface EventRegistryGenerationOptions {
  readonly projectRoot: string;
  readonly generatedDirectory?: string;
}

/** Generates the module augmentation used by event-name autocomplete and callback inference. */
export function generateEventRegistry(
  descriptors: readonly ExtractedDescriptor[],
  options: EventRegistryGenerationOptions,
): string {
  const root = resolve(options.projectRoot);
  const output = resolve(root, options.generatedDirectory ?? ".zsys/generated");
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
    'import "@zsys/events";',
    "",
    'declare module "@zsys/events" {',
    "  interface EventRegistry {",
    ...entries,
    "  }",
    "}",
    "",
    "export {};",
    "",
  ].join("\n");
}

function importPath(output: string, root: string, module: string): string {
  const source = resolve(root, normalizeSourcePath(module, root));
  const path = relative(output, source)
    .replaceAll("\\", "/")
    .replace(/\.(?:[cm]?ts|tsx)$/, ".js");
  return path.startsWith(".") ? path : `./${path}`;
}
