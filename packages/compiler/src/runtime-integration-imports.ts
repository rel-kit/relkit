/**
 * Emits statically analyzable selected integration imports after fresh dependency
 * preflight. Literal dynamic imports preserve build tracing while preventing SDK
 * evaluation from racing the diagnostic check or relying on old preparation.
 */
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
          (value) =>
            `const __relkit_runtime_${index} = await Effect.runPromise(initializeIntegration(${sourceJson(JSON.stringify(entry.packageName))}, async () => await import(${sourceJson(JSON.stringify(value))})));`,
        ),
      ),
    );
    const entries = modules.map(
      (entry, index) =>
        `  { packageName: ${sourceJson(JSON.stringify(entry.packageName))}, packageVersion: ${sourceJson(JSON.stringify(entry.packageVersion))}, exportName: ${sourceJson(JSON.stringify(entry.exportName))}, module: __relkit_runtime_${index} },`,
    );
    if (imports.length === 0) return "export const runtimeIntegrationModules = [] as const;\n";
    const selectedPlan = {
      ...plan,
      integrations: [...plan.integrations].sort((left, right) =>
        `${moduleKey(left)}\0${left.capability}\0${left.adapterId}`.localeCompare(
          `${moduleKey(right)}\0${right.capability}\0${right.adapterId}`,
        ),
      ),
    };
    // Match the emitted module's native import ancestry after production relocation.
    const preflight = `import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import { checkIntegrationDependencies, SelectedDependenciesLive, initializeIntegration } from "@relkit/app/internal/runtime";
await Effect.runPromise(checkIntegrationDependencies(${sourceJson(JSON.stringify(selectedPlan))}, { projectRoot: fileURLToPath(new URL(".", import.meta.url)), phase: "runtime" }).pipe(Effect.provide(SelectedDependenciesLive)));
`;
    return `${preflight}${imports.join("\n")}\n\nexport const runtimeIntegrationModules = [\n${entries.join("\n")}\n] as const;\n`;
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

/** Keeps serialized metadata inert even when generated JavaScript is embedded in HTML.
 * @param json - Already serialized JSON expression; JSON escaping preserves its value.
 * @returns Source-safe JSON with no script-closing delimiter.
 */
function sourceJson(json: string): string {
  return json.replaceAll("<", "\\u003c");
}
