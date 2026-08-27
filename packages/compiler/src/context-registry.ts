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
  const dataModel = descriptors.find((entry) => entry.descriptor.kind === "data-model");
  const auth = descriptors.find((entry) => isAuthRoute(entry));
  const constants = descriptors.filter((entry) => entry.descriptor.kind === "constants");
  const prompts = descriptors.filter((entry) => entry.descriptor.kind === "prompt");
  const fields = [
    dataModel === undefined
      ? undefined
      : `    readonly database: import("@relkit/drizzle").DatabaseContext<${importType(dataModel, output, root)}>;`,
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
    "declare global {",
    "  namespace Relkit {",
    "    interface ApplicationContextRegistry {",
    ...fields,
    "    }",
    "  }",
    "}",
    "",
    "export {};",
    "",
  ].join("\n");
}

function importType(entry: ExtractedDescriptor, output: string, root: string): string {
  const source = resolve(root, normalizeSourcePath(entry.reference.module, root));
  const path = relative(output, source)
    .replaceAll("\\", "/")
    .replace(/\.(?:[cm]?ts|tsx)$/, ".js");
  const module = path.startsWith(".") ? path : `./${path}`;
  return `typeof import(${JSON.stringify(module)})[${JSON.stringify(entry.exportName)}]`;
}

function isAuthRoute(entry: ExtractedDescriptor): boolean {
  if (entry.descriptor.kind !== "route") return false;
  const metadata = entry.descriptor.metadata;
  return isRecord(metadata) && isRecord(metadata.auth) && metadata.auth.kind === "better-auth";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
