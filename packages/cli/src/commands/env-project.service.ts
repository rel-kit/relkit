import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Context, Effect, Layer, Schema } from "effect";
import type { EnvDefinition, EnvShape } from "@relkit/config";
import { cliAdapterError, cliOriginalError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import { CliModules, moduleLayer } from "../services/modules.service.js";
import { EnvCommandError, exampleValue } from "./env-format.js";
import { environmentDefinitionMarker } from "./env.schemas.js";
import type { EnvironmentProjectOperations } from "./env-project.types.js";

/** Declaration imports and explicit example writes with captured project authority. */
export class CliEnvironmentProject extends Context.Service<
  CliEnvironmentProject,
  EnvironmentProjectOperations
>()("relkit/cli/EnvironmentProject") {}

/**
 * Captures filesystem and uncached module capabilities for one invocation.
 * @returns An environment Layer requiring those two capabilities.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * const definition = await Effect.runPromise(CliEnvironmentProject.use((project) => project.load({})).pipe(Effect.provide(environmentProjectLayer)));
 * ```
 */
export const environmentProjectLive = Layer.effect(
  CliEnvironmentProject,
  Effect.gen(function* () {
    const files = yield* CliFileSystem;
    const modules = yield* CliModules;
    return CliEnvironmentProject.of({
      load: Effect.fn("EnvironmentProject.load")(
        function* (options) {
          if (options.definition !== undefined) return options.definition;
          const root = resolve(options.projectRoot ?? process.cwd());
          const path = resolve(root, options.envPath ?? join("src", "env.ts"));
          yield* cliTry("env.path", () => assertInside(root, path, "Environment"));
          const loaded = yield* modules
            .load(`${pathToFileURL(path).href}?relkit_env=1`)
            .pipe(
              Effect.mapError(() =>
                cliAdapterError(
                  "env.load",
                  new EnvCommandError(
                    "RELKIT_ENV_NOT_FOUND",
                    `Environment contract was not found at ${relative(root, path)}.`,
                  ),
                ),
              ),
            );
          const value = loaded.default ?? loaded.env ?? loaded;
          const definition = Schema.is(environmentDefinitionMarker)(value)
            ? value
            : isRecord(value)
              ? value.env
              : undefined;
          if (!Schema.is(environmentDefinitionMarker)(definition))
            return yield* Effect.fail(
              cliAdapterError(
                "env.definition",
                new EnvCommandError(
                  "RELKIT_ENV_INVALID",
                  "The environment module does not export an environment definition.",
                ),
              ),
            );
          // Opaque defineEnv objects contain native callbacks/non-enumerable references.
          // Preserve the legacy marker-only load contract; projectEnvEffect performs the owner's full builder validation before command use.
          return definition as unknown as EnvDefinition<EnvShape>;
        },
        (effect) => observeCli("env.load", effect),
      ),
      example: Effect.fn("EnvironmentProject.example")(
        function* (fields, options, write) {
          const content = `${fields.map((field) => `${field.name}=${exampleValue(field)}`).join("\n")}\n`;
          const root = resolve(options.projectRoot ?? process.cwd());
          const path = resolve(root, options.examplePath ?? ".env.example");
          yield* cliTry("env.examplePath", () => assertInside(root, path, "Example"));
          const existing = yield* files.readText(path).pipe(
            Effect.as(true),
            Effect.catchTag("CliAdapterError", (error) => {
              const cause = cliOriginalError(error);
              return cause instanceof Error && "code" in cause && cause.code === "ENOENT"
                ? Effect.succeed(false)
                : Effect.fail(error);
            }),
          );
          if (write) yield* files.writeText(path, content);
          return {
            ok: true as const,
            command: "example" as const,
            path,
            existing,
            written: write,
            content,
          };
        },
        (effect) => observeCli("env.example", effect),
      ),
    });
  }),
);

/** Explicit native environment dependency graph, local to the invoking edge. */
export const environmentProjectLayer = environmentProjectLive.pipe(
  Layer.provide(Layer.merge(fileSystemLayer, moduleLayer)),
);

/**
 * Preserves existing containment checks before module access or file mutation.
 * @param root - Absolute project root.
 * @param path - Absolute selected path.
 * @param label - Existing error text label.
 * @returns Void for an accepted path.
 * @throws EnvCommandError for a path outside the project.
 */
function assertInside(root: string, path: string, label: string): void {
  const local = relative(root, path);
  if (local !== "" && (local.startsWith("..") || isAbsolute(local)))
    throw new EnvCommandError(
      "RELKIT_ENV_USAGE",
      `${label} path must remain inside the project root.`,
    );
}

/**
 * Narrows a module's candidate wrapper without evaluating its properties as JSON.
 * @param value - Imported definition candidate.
 * @returns Whether it is an object with arbitrary opaque properties.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
