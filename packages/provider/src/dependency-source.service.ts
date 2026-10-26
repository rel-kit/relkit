/**
 * Resolves physical package manifests using the consumer's native search paths.
 * Reading the manifest directly supports packages hiding package.json in exports;
 * resolution never evaluates a module or consults a global CLI/package-runner root.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import { satisfies } from "semver";
import { IntegrationDependencyRequirements } from "@relkit/contracts";
import { DependencyResolutionFailure } from "./dependency-preflight.errors.js";
import type { DependencySourceContract } from "./dependency-preflight.types.js";
import { observeProvider } from "./provider-observability.js";
import { dependencyProjectManager } from "./dependency-project-manager.js";

const Identity = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  relkit: Schema.optional(
    Schema.Struct({
      integration: Schema.optional(
        Schema.Struct({
          id: Schema.String,
          dependencies: Schema.optional(IntegrationDependencyRequirements),
        }),
      ),
    }),
  ),
});
const PackageName = Schema.Struct({ name: Schema.optional(Schema.String) });

/** Reads identity and requirement metadata together without importing package code. */
function readIdentity(name: string, directory: string, self = false) {
  const text = readFileSync(join(directory, "package.json"), "utf8");
  if (self && Schema.decodeUnknownSync(Schema.fromJsonString(PackageName))(text).name !== name)
    return null;
  const identity = Schema.decodeUnknownSync(Schema.fromJsonString(Identity))(text);
  if (identity.name !== name) throw new TypeError(`Dependency identity differs: ${name}`);
  const metadata = identity.relkit?.integration;
  return {
    name,
    version: identity.version,
    root: realpathSync(directory),
    ...(metadata === undefined
      ? {}
      : { integrationId: metadata.id, requirements: metadata.dependencies ?? [] }),
  };
}

/**
 * Reads a package from a caller-provided resolver boundary.
 * @param name - Valid package name to search in native package directories.
 * @param from - Application root or canonical selected adapter root.
 * @returns Lazy optional installed identity, or a distinct read/metadata failure.
 */
const resolvePackage = Effect.fn("DependencySource.resolve")(
  (name: string, from: string) =>
    Effect.try({
      try: () => {
        if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name))
          throw new TypeError("Invalid dependency package name");
        if (existsSync(join(from, "package.json"))) {
          const own = readIdentity(name, from, true);
          if (own !== null) return own;
        }
        const ancestors = new Set<string>();
        for (let directory = resolve(from); ; directory = dirname(directory)) {
          ancestors.add(join(directory, "node_modules"));
          if (dirname(directory) === directory) break;
        }
        const paths = (createRequire(join(from, "package.json")).resolve.paths(name) ?? []).filter(
          (directory) => ancestors.has(resolve(directory)),
        );
        for (const directory of paths) {
          const candidate = join(directory, name, "package.json");
          if (!existsSync(candidate)) continue;
          return readIdentity(name, join(directory, name));
        }
        return null;
      },
      catch: (cause) =>
        new DependencyResolutionFailure({
          package: name,
          from,
          cause: new Error("Dependency metadata resolution failed", { cause }),
        }),
    }),
  (effect) => observeProvider("dependency.resolve", effect),
);

/** Native resolution is captured once by the selected dependency service Layer. */
export class DependencySource extends Context.Service<DependencySource, DependencySourceContract>()(
  "relkit/provider/DependencySource",
  {
    make: Effect.succeed({
      resolve: resolvePackage,
      satisfies,
      manager: dependencyProjectManager,
    } satisfies DependencySourceContract),
  },
) {}

/** Read-only native implementation; no resource outlives a synchronous metadata read. */
export const DependencySourceLive = Layer.effect(DependencySource, DependencySource.make);
