/**
 * Reads only the consuming project's declared installer. Runner environment and
 * cache paths never select correction commands; absent metadata defaults to Bun.
 * Non-string metadata and unsupported installer identities remain typed failures;
 * only the installer name is interpreted, without validating a version suffix.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { DependencyResolutionFailure } from "./dependency-preflight.errors.js";
import { observeProvider } from "./provider-observability.js";
import type { DependencyPackageManager } from "./dependency-preflight.types.js";

const Project = Schema.Struct({ packageManager: Schema.optional(Schema.String) });

/**
 * Resolves the installer from project-owned metadata without executing code.
 * @param projectRoot - Actual application root supplied by its caller.
 * @returns Declared supported manager or Bun when no declaration exists.
 */
export const dependencyProjectManager = Effect.fn("DependencySource.manager")(
  (projectRoot: string) =>
    Effect.try({
      try: (): DependencyPackageManager => {
        const path = join(projectRoot, "package.json");
        if (!existsSync(path)) return "bun";
        const project = Schema.decodeUnknownSync(Schema.fromJsonString(Project))(
          readFileSync(path, "utf8"),
        );
        if (project.packageManager === undefined) return "bun";
        const name = project.packageManager.split("@")[0];
        if (name === "bun" || name === "npm" || name === "pnpm") return name;
        throw new TypeError(`Unsupported project package manager: ${project.packageManager}`);
      },
      catch: (cause) =>
        new DependencyResolutionFailure({
          package: "packageManager",
          from: projectRoot,
          cause: new Error("Project package manager metadata is invalid", { cause }),
        }),
    }),
  (effect) => observeProvider("dependency.manager", effect),
);
