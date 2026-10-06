import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeId } from "@relkit/contracts";
import { Effect, Schema } from "effect";
import { observeCli } from "../cli-runtime.js";
import { cliTry } from "../cli-errors.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { CliModules } from "../services/modules.service.js";
import { isInside } from "./check-support.js";
import type { CheckOptions, CheckSource } from "./check.types.js";

import { projectPackageSchema } from "./check.schemas.js";

/**
 * Loads only a project-contained configuration, with one generation-owned import identity.
 * @param projectRoot - Absolute authored project root.
 * @param options - Config override or contained module path.
 * @param generationId - Import epoch shared with this compilation.
 * @returns The untrusted configuration for the compiler's schema boundary.
 */
export const readConfigEffect = Effect.fn("Project.readConfig")(
  function* (projectRoot: string, options: CheckOptions, generationId: string) {
    if (options.config !== undefined) return options.config;
    const files = yield* CliFileSystem;
    const modules = yield* CliModules;
    const configPath = resolve(projectRoot, options.configPath ?? "relkit.config.ts");
    yield* cliTry("project.configPath", () => {
      if (!isInside(projectRoot, configPath))
        throw new Error("Config path must remain inside project root.");
    });
    if (!(yield* files.exists(configPath)))
      return yield* cliTry("project.config", () => {
        throw new Error("relkit.config.ts was not found.");
      });
    const loaded = yield* modules.load(
      `${pathToFileURL(configPath).href}?relkit_check=${encodeURIComponent(generationId)}`,
    );
    return loaded.default ?? loaded;
  },
  (effect, _projectRoot: string, _options: CheckOptions, _generationId: string) =>
    observeCli("project.readConfig", effect),
);

/**
 * Reads sorted source snapshots with bounded concurrency and fiber cancellation.
 * @param projectRoot - Absolute root for source resolution.
 * @param patterns - Authored compiler include patterns.
 * @returns Source paths and UTF-8 snapshots in deterministic order.
 */
export const readSourcesEffect = Effect.fn("Project.readSources")(
  function* (projectRoot: string, patterns: readonly string[]) {
    const files = yield* CliFileSystem;
    const names = yield* files.files(projectRoot, patterns);
    return yield* Effect.forEach(
      names,
      (fileName) =>
        files
          .readText(join(projectRoot, fileName))
          .pipe(Effect.map((text): CheckSource => ({ fileName, text }))),
      { concurrency: 8 },
    );
  },
  (effect, _projectRoot: string, _patterns: readonly string[]) =>
    observeCli("project.readSources", effect),
);

/**
 * Adds the configuration's source to discovery without evaluating it twice.
 * @param projectRoot - Absolute project root.
 * @param options - Configuration module selection.
 * @param sources - Existing authored source snapshots.
 * @returns Compiler discovery sources including the contained config module.
 */
export const discoverySourcesEffect = Effect.fn("Project.discoverySources")(
  function* (projectRoot: string, options: CheckOptions, sources: readonly CheckSource[]) {
    const files = yield* CliFileSystem;
    const configPath = resolve(projectRoot, options.configPath ?? "relkit.config.ts");
    const fileName = relative(projectRoot, configPath).replaceAll("\\", "/");
    const text = yield* files.readText(configPath);
    return [...sources.filter((source) => source.fileName !== fileName), { fileName, text }];
  },
  (effect, _projectRoot: string, _options: CheckOptions, _sources: readonly CheckSource[]) =>
    observeCli("project.discoverySources", effect),
);

/**
 * Validates the package application identity before normalizing graph IDs.
 * @param projectRoot - Root containing the authored package manifest.
 * @returns A normalized application ID or a typed read/schema failure.
 */
export const packageApplicationIdEffect = Effect.fn("Project.applicationId")(
  function* (projectRoot: string) {
    const files = yield* CliFileSystem;
    const text = yield* files.readText(join(projectRoot, "package.json"));
    const value: unknown = yield* cliTry("project.packageJson", () => JSON.parse(text));
    const parsed = yield* cliTry("project.packageName", () => {
      if (!Schema.is(projectPackageSchema)(value))
        throw new TypeError("package.json.name is required when config.id is omitted");
      return value;
    });
    const name = parsed.name.startsWith("@") ? parsed.name.slice(1) : parsed.name;
    return yield* cliTry("project.applicationId", () => normalizeId(name.replaceAll("/", ".")));
  },
  (effect, _projectRoot: string) => observeCli("project.applicationId", effect),
);
