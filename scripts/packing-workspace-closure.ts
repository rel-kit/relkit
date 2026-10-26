/** Selects first-party manifests required by the isolated package-manager packing workspace. */
import type { DependencyFields } from "./catalog-manifest.types.js";
import { dependencyFields } from "./catalog-manifest.js";

/**
 * Retains root order while traversing workspace declarations without changing manifests or versions.
 * @param roots - First-party packages selected by the packing workflow.
 * @param manifests - Authoritative source package declarations.
 * @returns Each required workspace package once, in deterministic discovery order.
 */
export function packingWorkspaceClosure(
  roots: readonly string[],
  manifests: ReadonlyMap<string, { readonly manifest: Partial<DependencyFields> }>,
): string[] {
  const names = [...new Set(roots)];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]!;
    const item = manifests.get(name);
    if (item === undefined) throw new Error(`Missing workspace package ${name}`);
    for (const field of dependencyFields)
      for (const [dependency, spec] of Object.entries(item.manifest[field] ?? {})) {
        if (spec.startsWith("workspace:") && !manifests.has(dependency))
          throw new Error(`Missing workspace package ${dependency}`);
        if (manifests.has(dependency) && !names.includes(dependency)) names.push(dependency);
      }
  }
  return names;
}
