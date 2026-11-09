import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { relative, resolve } from "node:path";
import { normalizeSourcePath } from "relkit/contracts";
import type { ExtractedDescriptor } from "./discovery/extract.js";
import type { ContextRegistryGenerationOptions } from "./context-registry.types.js";
export type { ContextRegistryGenerationOptions } from "./context-registry.types.js";

export const CONTEXT_REGISTRY_FILE = "context-registry.d.ts";

/**
 * Renders context registry declarations for graph-visible resources.
 * @param descriptors - Ordered normalized descriptors.
 * @param options - Caller-supplied configuration for this operation.
 * @returns A lazy effect that renders context registry declarations for graph-visible resources; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const generateContextRegistryEffect = Effect.fn("Compiler.generateContextRegistry")(
  function* (
    descriptors: readonly ExtractedDescriptor[],
    options: ContextRegistryGenerationOptions,
  ) {
    const root = resolve(options.projectRoot);
    const output = resolve(root, options.generatedDirectory ?? ".relkit/generated");
    const application = descriptors.find((entry) => entry.descriptor.kind === "app");
    const databases = descriptors.filter((entry) => hasCapability(entry, "drizzle"));
    const database =
      databases.find((entry) => hasCapability(entry, "drizzle", true)) ?? databases[0];
    const auth = descriptors.find((entry) => hasCapability(entry, "better-auth"));
    const constants = descriptors.filter((entry) => entry.descriptor.kind === "constants");
    const prompts = descriptors.filter((entry) => entry.descriptor.kind === "prompt");
    const tasks = registryEntries(descriptors, "task", output, root);
    const jobs = registryEntries(descriptors, "job", output, root);
    const handle = handleRegistries(descriptors, output, root, options.identities);
    const fields = [
      database === undefined
        ? undefined
        : `    readonly database: import("@relkit/drizzle").DatabaseContext<${importType(database, output, root)}>;`,
      auth === undefined
        ? undefined
        : `    readonly auth: import("relkit/functions").AuthContext<import("@relkit/better-auth").InferBetterAuthSession<${importType(auth, output, root)}["handler"]>>;`,
      constants.length === 0
        ? undefined
        : `    readonly constants: ${constants.map((entry) => `import("relkit").ResolvedConstants<${importType(entry, output, root)}>`).join(" & ")};`,
      prompts.length === 0
        ? undefined
        : `    readonly prompts: { ${prompts.map((entry) => `readonly ${JSON.stringify(entry.exportName)}: import("relkit").ResolvedPrompt<${importType(entry, output, root)}>`).join("; ")} };`,
    ].filter((value): value is string => value !== undefined);
    return [
      ...(application === undefined
        ? []
        : [
            `type RelkitApplicationEnv = import("relkit/config").ResolvedEnv<${importType(application, output, root)}["env"]["shape"]>;`,
            "",
          ]),
      "declare global {",
      "  namespace Relkit {",
      ...(application === undefined
        ? ["    interface ApplicationEnv {}"]
        : ["    interface ApplicationEnv extends RelkitApplicationEnv {}"]),
      "    interface ApplicationContextRegistry {",
      ...fields,
      "    }",
      "    interface TaskRegistry {",
      ...tasks,
      "    }",
      "    interface JobRegistry {",
      ...jobs,
      "    }",
      ...handle,
      "  }",
      "}",
      "",
      "export {};",
      "",
    ].join("\n");
  },
  (effect, descriptors, options) =>
    observeCompiler("generation", "generateContextRegistry", effect, () => ({
      descriptors: descriptors.length,
    })),
);

/**
 * Renders context registry declarations for graph-visible resources.
 * @param descriptors - Ordered normalized descriptors.
 * @param options - Caller-supplied configuration for this operation.
 * @returns Generated TypeScript source for graph-visible context resources.
 */
export function generateContextRegistry(
  descriptors: readonly ExtractedDescriptor[],
  options: ContextRegistryGenerationOptions,
): string {
  return runCompilerSync(generateContextRegistryEffect(descriptors, options));
}

/**
 * Projects context registry entries for one resource kind.
 * @param descriptors - Ordered normalized descriptors.
 * @param kind - Descriptor or syntax category.
 * @param output - Generated output filename.
 * @param root - Canonical root used for path resolution.
 * @returns Context registry property declarations for the requested resource kind.
 */
function registryEntries(
  descriptors: readonly ExtractedDescriptor[],
  kind: string,
  output: string,
  root: string,
  include: (entry: ExtractedDescriptor) => boolean = () => true,
  identities?: ReadonlyMap<string, string>,
): readonly string[] {
  const seen = new Set<string>();
  const idOf = (entry: ExtractedDescriptor) =>
    identities?.get(identityKey(entry.reference.module, entry.exportName)) ?? entry.descriptor.id;
  return descriptors
    .filter((entry) => entry.descriptor.kind === kind && include(entry))
    .sort(
      (left, right) =>
        idOf(left).localeCompare(idOf(right)) ||
        left.reference.module.localeCompare(right.reference.module) ||
        left.exportName.localeCompare(right.exportName),
    )
    .flatMap((entry) => {
      const id = idOf(entry);
      if (seen.has(id)) return [];
      seen.add(id);
      const module = importPath(output, root, entry.reference.module);
      return [
        `    readonly ${JSON.stringify(id)}: typeof import(${JSON.stringify(module)})[${JSON.stringify(entry.exportName)}];`,
      ];
    });
}

/**
 * Renders the registries that type the runtime handle returned by `getRelkit()`.
 * @param descriptors - Ordered normalized descriptors.
 * @param output - Generated output filename.
 * @param root - Canonical root used for path resolution.
 * @returns Interface declarations keyed by service or descriptor ID.
 */
function handleRegistries(
  descriptors: readonly ExtractedDescriptor[],
  output: string,
  root: string,
  identities: ReadonlyMap<string, string> | undefined,
): readonly string[] {
  const sections: readonly (readonly [string, string, (entry: ExtractedDescriptor) => boolean])[] =
    [
      ["HandleServices", "service", () => true],
      ["HandleDatabases", "service", (entry) => hasCapability(entry, "drizzle")],
      ["HandleCaches", "cache", () => true],
      ["HandleBuckets", "bucket", () => true],
      ["HandleChannels", "channel", () => true],
      ["HandleAgents", "agent", () => true],
    ];
  return sections.flatMap(([name, kind, include]) => [
    `    interface ${name} {`,
    ...registryEntries(descriptors, kind, output, root, include, identities),
    "    }",
  ]);
}

/**
 * Keys a descriptor by its source module and export name.
 * @param module - Authored source module.
 * @param exportName - Export binding.
 * @returns The lookup key used by `identities`.
 */
export function identityKey(module: string, exportName: string): string {
  return `${module}\0${exportName}`;
}

/**
 * Maps each normalized descriptor's source binding to its resolved ID, for `identities`.
 * @param descriptors - Descriptors after normalization resolved their IDs.
 * @returns Resolved IDs keyed by `<module>\0<export name>`.
 */
export function resolvedIdentities(
  descriptors: readonly {
    readonly id: string;
    readonly exportName: string;
    readonly reference?: { readonly module: string };
  }[],
): ReadonlyMap<string, string> {
  return new Map(
    descriptors.flatMap((descriptor) =>
      descriptor.reference === undefined
        ? []
        : [
            [
              identityKey(descriptor.reference.module, descriptor.exportName),
              descriptor.id,
            ] as const,
          ],
    ),
  );
}

/**
 * Renders a type import for a generated context registry entry.
 * @param entry - Validated entry to project.
 * @param output - Generated output filename.
 * @param root - Canonical root used for path resolution.
 * @returns A TypeScript type import for the resource's source binding.
 */
function importType(entry: ExtractedDescriptor, output: string, root: string): string {
  const module = importPath(output, root, entry.reference.module);
  return `typeof import(${JSON.stringify(module)})[${JSON.stringify(entry.exportName)}]`;
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

/**
 * Checks a specialized service capability marker.
 * @param entry - Validated entry to project.
 * @param kind - Descriptor or syntax category.
 * @returns True when the descriptor requires the selected context capability.
 */
function hasCapability(entry: ExtractedDescriptor, kind: string, isDefault = false): boolean {
  const metadata = entry.descriptor.kind === "service" ? entry.descriptor.metadata : undefined;
  const capability = isRecord(metadata) ? metadata.capability : undefined;
  if (!isRecord(capability) || capability.kind !== kind) return false;
  return !isDefault || capability.default === true;
}

/**
 * Recognizes nonnull nonarray objects for metadata inspection.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for a nonnull, nonarray metadata object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
