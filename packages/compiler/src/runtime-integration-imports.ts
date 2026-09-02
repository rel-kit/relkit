import type { RuntimeIntegrationPlan } from "@relkit/contracts";

interface RuntimeModuleImport {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
}

export function generateRuntimeIntegrationImports(plan: RuntimeIntegrationPlan): string {
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
  const imports = modules.map(
    (entry, index) =>
      `import * as __relkit_runtime_${index} from ${JSON.stringify(specifier(entry))};`,
  );
  const entries = modules.map(
    (entry, index) =>
      `  { packageName: ${JSON.stringify(entry.packageName)}, packageVersion: ${JSON.stringify(entry.packageVersion)}, exportName: ${JSON.stringify(entry.exportName)}, module: __relkit_runtime_${index} },`,
  );
  if (imports.length === 0) return "export const runtimeIntegrationModules = [] as const;\n";
  return `${imports.join("\n")}\n\nexport const runtimeIntegrationModules = [\n${entries.join("\n")}\n] as const;\n`;
}

function specifier(entry: RuntimeModuleImport): string {
  if (
    !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(entry.packageName) ||
    !/^\.\/[a-z0-9._/-]+$/i.test(entry.exportName) ||
    entry.exportName.split("/").includes("..")
  ) {
    throw new TypeError("Runtime integration import metadata is invalid.");
  }
  return `${entry.packageName}/${entry.exportName.slice(2)}`;
}

function moduleKey(entry: RuntimeModuleImport): string {
  return [entry.packageName, entry.packageVersion, entry.exportName].join("\0");
}
