import { join } from "node:path";
import ownManifest from "../package.json";
import { Effect, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { EXAMPLE_PATH_PREFIXES, listProjectFilesEffect } from "./generate-files.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { domainError, domainTry } from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import type { GenerateProjectContext } from "./generate-types.js";
import type { CreateOptions } from "./options.js";
import type { CreateScaffoldPlan } from "./create-preview.types.js";
export type { CreateScaffoldPlan } from "./create-preview.types.js";
import { ProjectManifest } from "./project-manifest.schemas.js";
import { readAppDiscovery } from "./project-discovery-app.js";
import { validateCreateOptionsEffect } from "./validate.js";
import { resolveTemplateRootEffect } from "./template-root.js";

/**
 * Previews explicit creation flags without mutating project or staging paths.
 * @param options - Normalized creation flags.
 * @param context - Existing template and current-directory settings.
 * @returns A lazy immutable file/dependency/profile preview.
 */
export const planCreateEffect = Effect.fn("CreatePreview.plan")(
  function* (
    options: CreateOptions,
    context: Pick<GenerateProjectContext, "cwd" | "templateRoot"> = {},
  ) {
    const validated = yield* validateCreateOptionsEffect(
      options,
      context.cwd === undefined ? {} : { cwd: context.cwd },
    );
    const root = join(
      yield* resolveTemplateRootEffect(context),
      options.jobs === undefined ? options.template : "tasks",
    );
    const fs = yield* GeneratorFileSystem;
    const source = yield* fs.readText(join(root, "package.json"));
    const parsed = yield* domainTry(() => JSON.parse(source) as unknown);
    const manifest = yield* Schema.decodeUnknownEffect(ProjectManifest)(parsed).pipe(
      Effect.mapError(domainError),
    );
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
    const version = dependencies["@relkit/app"] ?? ownManifest.version;
    if (options.cloud === "aws") dependencies["@relkit/aws"] = version;
    if (options.deploy === "pulumi") dependencies["@relkit/pulumi"] = version;
    if (options.jobs !== undefined) {
      dependencies["@relkit/docker"] = version;
      dependencies[`@relkit/${options.jobs.replace(/-docker$/u, "")}`] = version;
    }
    const configPath = join(root, "relkit.config.ts");
    const configSource = yield* fs.readText(configPath);
    const app = yield* domainTry(() => readAppDiscovery(configSource, configPath, root));
    const files = (yield* listProjectFilesEffect(root))
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
      profiles: Object.freeze(
        app.profiles.map((profile) => `${profile.capability}:${profile.name}`),
      ),
      warnings: Object.freeze([]),
    });
  },
  (effect) => observeExecution("generator", "create.preview", effect),
);

/**
 * Preserves the existing preview Promise API.
 * @param options - Normalized flags.
 * @param context - Existing template settings.
 * @returns Read-only creation details.
 */
export function planCreate(
  options: CreateOptions,
  context: Pick<GenerateProjectContext, "cwd" | "templateRoot"> = {},
): Promise<CreateScaffoldPlan> {
  return runGeneratorPromise(planCreateEffect(options, context));
}

/**
 * Formats an immutable preview as the existing human-readable terminal output.
 * @param plan - Complete immutable operation plan.
 * @returns Terminal text listing the destination, files, dependencies, profiles and warnings.
 */
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
