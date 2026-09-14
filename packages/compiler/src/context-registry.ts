import { relative, resolve } from "node:path";
import { normalizeSourcePath } from "@relkit/contracts";
import type { ExtractedDescriptor } from "./discovery/extract.js";

export const CONTEXT_REGISTRY_FILE = "context-registry.d.ts";

export function generateContextRegistry(
  descriptors: readonly ExtractedDescriptor[],
  options: { readonly projectRoot: string; readonly generatedDirectory?: string },
): string {
  const root = resolve(options.projectRoot);
  const output = resolve(root, options.generatedDirectory ?? ".relkit/generated");
  const application = descriptors.find((entry) => entry.descriptor.kind === "app");
  const database = descriptors.find((entry) => hasCapability(entry, "drizzle"));
  const auth = descriptors.find((entry) => hasCapability(entry, "better-auth"));
  const constants = descriptors.filter((entry) => entry.descriptor.kind === "constants");
  const prompts = descriptors.filter((entry) => entry.descriptor.kind === "prompt");
  const tasks = registryEntries(descriptors, "task", output, root);
  const jobs = registryEntries(descriptors, "job", output, root);
  const fields = [
    database === undefined
      ? undefined
      : `    readonly database: import("@relkit/drizzle").DatabaseContext<${importType(database, output, root)}>;`,
    auth === undefined
      ? undefined
      : `    readonly auth: import("@relkit/functions").AuthContext<import("@relkit/better-auth").InferBetterAuthSession<${importType(auth, output, root)}["handler"]>>;`,
    constants.length === 0
      ? undefined
      : `    readonly constants: ${constants.map((entry) => `import("@relkit/app").ResolvedConstants<${importType(entry, output, root)}>`).join(" & ")};`,
    prompts.length === 0
      ? undefined
      : `    readonly prompts: { ${prompts.map((entry) => `readonly ${JSON.stringify(entry.exportName)}: import("@relkit/app").ResolvedPrompt<${importType(entry, output, root)}>`).join("; ")} };`,
  ].filter((value): value is string => value !== undefined);
  return [
    ...(application === undefined
      ? []
      : [
          `type RelkitApplicationEnv = import("@relkit/config").ResolvedEnv<${importType(application, output, root)}["env"]["shape"]>;`,
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
    "  }",
    "}",
    "",
    "export {};",
    "",
  ].join("\n");
}

function registryEntries(
  descriptors: readonly ExtractedDescriptor[],
  kind: "task" | "job",
  output: string,
  root: string,
): readonly string[] {
  const seen = new Set<string>();
  return descriptors
    .filter(({ descriptor }) => descriptor.kind === kind)
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
}

function importType(entry: ExtractedDescriptor, output: string, root: string): string {
  const module = importPath(output, root, entry.reference.module);
  return `typeof import(${JSON.stringify(module)})[${JSON.stringify(entry.exportName)}]`;
}

function importPath(output: string, root: string, module: string): string {
  const source = resolve(root, normalizeSourcePath(module, root));
  const path = relative(output, source)
    .replaceAll("\\", "/")
    .replace(/\.(?:[cm]?ts|tsx)$/, ".js");
  return path.startsWith(".") ? path : `./${path}`;
}

function hasCapability(entry: ExtractedDescriptor, kind: string): boolean {
  if (entry.descriptor.kind !== "service") return false;
  const metadata = entry.descriptor.metadata;
  return isRecord(metadata) && isRecord(metadata.capability) && metadata.capability.kind === kind;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
