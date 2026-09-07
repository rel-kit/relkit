import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EXAMPLE_PATH_PREFIXES, listProjectFiles } from "./generate-files.js";
import type { GenerateProjectContext } from "./generate-types.js";
import type { CreateOptions } from "./options.js";
import { readAppDiscovery } from "./project-discovery-app.js";
import { validateCreateOptions } from "./validate.js";
import { resolveTemplateRoot } from "./template-root.js";

export interface CreateScaffoldPlan {
  readonly destination: string;
  readonly files: readonly string[];
  readonly dependencies: Readonly<Record<string, string>>;
  readonly profiles: readonly string[];
  readonly warnings: readonly string[];
}

export async function planCreate(
  options: CreateOptions,
  context: Pick<GenerateProjectContext, "cwd" | "templateRoot"> = {},
): Promise<CreateScaffoldPlan> {
  const validated = validateCreateOptions(
    options,
    context.cwd === undefined ? {} : { cwd: context.cwd },
  );
  const root = join(resolveTemplateRoot(context), options.template);
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  const version = dependencies["@relkit/app"] ?? "0.4.0";
  if (options.cloud === "aws") dependencies["@relkit/aws"] = version;
  if (options.deploy === "pulumi") dependencies["@relkit/pulumi"] = version;
  const configPath = join(root, "relkit.config.ts");
  const app = readAppDiscovery(await readFile(configPath, "utf8"), configPath, root);
  const files = (await listProjectFiles(root))
    .map((path) => (path === "gitignore" ? ".gitignore" : path))
    .filter(
      (path) =>
        options.examples ||
        !EXAMPLE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)),
    );
  return Object.freeze({
    destination: validated.destination,
    files: Object.freeze(files),
    dependencies: Object.freeze(Object.fromEntries(Object.entries(dependencies).sort())),
    profiles: Object.freeze(app.profiles.map((profile) => `${profile.capability}:${profile.name}`)),
    warnings: Object.freeze([]),
  });
}

export function formatCreatePlan(plan: CreateScaffoldPlan): string {
  return [
    `Destination: ${plan.destination}`,
    "Files:",
    ...plan.files.map((path) => `  ${path}`),
    "Dependencies:",
    ...Object.entries(plan.dependencies).map(([name, version]) => `  ${name}@${version}`),
    ...(plan.profiles.length
      ? ["Profiles:", ...plan.profiles.map((profile) => `  ${profile}`)]
      : []),
    ...(plan.warnings.length
      ? ["Warnings:", ...plan.warnings.map((warning) => `  ${warning}`)]
      : []),
  ].join("\n");
}
