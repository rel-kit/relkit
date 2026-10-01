import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { RuntimeIntegrationImportFailure } from "./runtime-integration-errors.js";
export { RuntimeIntegrationImportFailure } from "./runtime-integration-errors.js";
import type { RuntimeModuleImport } from "./runtime-integration-imports.types.js";
import type { RuntimeIntegrationPlan } from "@relkit/contracts";

/**
 * Renders static imports for the selected runtime integrations.
 * @param plan - Resolved runtime integration registrations to import.
 * @returns A lazy effect rendering static imports, with RuntimeIntegrationImportFailure for unsafe metadata; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const generateRuntimeIntegrationImportsEffect = Effect.fn(
  "Compiler.generateRuntimeIntegrationImports",
)(
  function* (plan: RuntimeIntegrationPlan) {
    const modules = [
      ...new Map(
        plan.integrations.map((entry) => {
          const selected = {
            packageName: entry.packageName,
            packageVersion: entry.packageVersion,
            exportName: entry.exportName,
          };
          return [moduleKey(selected), selected] as const;
        }),
      ).values(),
    ].sort((left, right) => moduleKey(left).localeCompare(moduleKey(right)));
    const imports = yield* Effect.forEach(modules, (entry, index) =>
      specifierEffect(entry).pipe(
        Effect.map(
          (value) => `import * as __relkit_runtime_${index} from ${JSON.stringify(value)};`,
        ),
      ),
    );
    const entries = modules.map(
      (entry, index) =>
        `  { packageName: ${JSON.stringify(entry.packageName)}, packageVersion: ${JSON.stringify(entry.packageVersion)}, exportName: ${JSON.stringify(entry.exportName)}, module: __relkit_runtime_${index} },`,
    );
    if (imports.length === 0) return "export const runtimeIntegrationModules = [] as const;\n";
    return `${imports.join("\n")}\n\nexport const runtimeIntegrationModules = [\n${entries.join("\n")}\n] as const;\n`;
  },
  (effect, plan) =>
    observeCompiler("generation", "generateRuntimeIntegrationImports", effect, () => ({
      registrations: plan.integrations.length,
    })),
);

/**
 * Renders static imports for the selected runtime integrations.
 * @param plan - Resolved runtime integration registrations to import.
 * @returns Static TypeScript imports for selected runtime integrations.
 */
export function generateRuntimeIntegrationImports(plan: RuntimeIntegrationPlan): string {
  return runCompilerSync(
    generateRuntimeIntegrationImportsEffect(plan).pipe(Effect.mapError((error) => error.cause)),
  );
}

/**
 * Renders the executable import specifier for a runtime integration.
 * @param entry - Validated entry to project.
 * @returns A lazy effect yielding an executable import specifier or RuntimeIntegrationImportFailure.
 */
const specifierEffect = Effect.fnUntraced(function* (entry: RuntimeModuleImport) {
  if (
    !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(entry.packageName) ||
    !/^\.\/[a-z0-9._/-]+$/i.test(entry.exportName) ||
    entry.exportName.split("/").includes("..")
  ) {
    return yield* new RuntimeIntegrationImportFailure({
      cause: new TypeError("Runtime integration import metadata is invalid."),
    });
  }
  return `${entry.packageName}/${entry.exportName.slice(2)}`;
});

/**
 * Creates a stable key for deduplicating runtime integration imports.
 * @param entry - Validated entry to project.
 * @returns A stable key for deduplicating runtime integration imports.
 */
function moduleKey(entry: RuntimeModuleImport): string {
  return [entry.packageName, entry.packageVersion, entry.exportName].join("\0");
}
