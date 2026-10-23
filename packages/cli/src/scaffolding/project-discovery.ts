/** Composes source inspection and filesystem discovery into service, artifact and provider facts used by CLI scaffolding resolution. */

import { join, resolve } from "node:path";
import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ADD_FAILURE_CODES, AddScaffoldError } from "create-relkit/internal/add-types";
import { GeneratorFileSystem } from "create-relkit/internal/generator-filesystem";
import { domainError, domainTry } from "create-relkit/internal/generator-errors";
import { runGeneratorPromise } from "create-relkit/internal/generator-runtime";
import { discoveryFacts } from "./project-discovery-facts.js";
import type { ProjectDiscoveryService } from "./project-discovery.service.types.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";

/** Declaration-only project discovery authority; never imports user application modules. */
export class ProjectDiscoveryServiceTag extends Context.Service<
  ProjectDiscoveryServiceTag,
  ProjectDiscoveryService
>()("create-relkit/ProjectDiscovery") {}

/**
 * Discovery implementation with bounded independent reads and deterministic source order.
 * @returns A ProjectDiscovery Layer requiring only GeneratorFileSystem authority.
 */
export const projectDiscoveryLive = Layer.effect(
  ProjectDiscoveryServiceTag,
  Effect.gen(function* () {
    const fs = yield* GeneratorFileSystem;
    return ProjectDiscoveryServiceTag.of({
      discover: Effect.fn("ProjectDiscovery.discover")((projectRoot: string) =>
        observeExecution(
          "generator",
          "discovery.discover",
          Effect.gen(function* () {
            const root = resolve(projectRoot);
            const appSource = yield* Effect.gen(function* () {
              yield* fs.readText(join(root, "package.json"));
              return yield* fs.readText(join(root, "relkit.config.ts"));
            }).pipe(
              Effect.mapError(() =>
                domainError(
                  new AddScaffoldError(
                    ADD_FAILURE_CODES.invalidProject,
                    `${root} is not a RELKIT project (package.json and relkit.config.ts are required).`,
                  ),
                ),
              ),
            );
            const paths = yield* fs.glob(root, "src/**/*.ts");
            const modules = yield* Effect.forEach(
              paths,
              (path) =>
                fs
                  .readText(join(root, path))
                  .pipe(Effect.map((text) => ({ fileName: path, text }))),
              { concurrency: 4 },
            );
            return yield* domainTry(() => discoveryFacts(root, appSource, modules));
          }),
        ),
      ),
    });
  }),
);

/**
 * Discovers canonical RELKIT source facts using caller-provided filesystem authority.
 * @param projectRoot - Project directory.
 * @returns Lazy declaration-only discovery with its service visible in the type.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { discoverProjectEffect, projectDiscoveryLive } from "@relkit/cli/scaffolding";
 * const inspect = discoverProjectEffect("./my-app").pipe(Effect.provide(projectDiscoveryLive));
 * // Supply GeneratorFileSystem at the application or test composition boundary.
 * ```
 */
export const discoverProjectEffect = Effect.fn("ProjectDiscovery.inspect")(
  function* (projectRoot: string) {
    return yield* (yield* ProjectDiscoveryServiceTag).discover(projectRoot);
  },
  (effect) => observeExecution("generator", "ProjectDiscovery.inspect", effect),
);

/**
 * Preserves the existing Promise discovery API and original rejection constructors.
 * @param projectRoot - Project directory.
 * @returns Canonical services, artifacts and profiles.
 */
export function discoverProject(projectRoot: string): Promise<ProjectDiscovery> {
  return runGeneratorPromise(
    discoverProjectEffect(projectRoot).pipe(Effect.provide(projectDiscoveryLive)),
  );
}
