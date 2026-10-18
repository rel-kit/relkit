/**
 * Plans one native Drizzle service at the selected application boundary, including
 * schema tooling and environment declarations. Generator filesystem authority owns
 * source publication; no database client or migration runs during this workflow.
 */
import { Effect } from "effect";
import { dirname } from "node:path";
import { scaffoldServiceBoundary } from "./scaffold-layout.js";
import { domainError, domainTry } from "./generator-errors.js";
import type { RenderedDatabase } from "./render-database.types.js";
export type { RenderedDatabase } from "./render-database.types.js";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { ADD_FAILURE_CODES, AddScaffoldError, type AddRequest } from "./add-types.js";
import { PlanBuilder } from "./plan-builder.js";
import { ensureEnvironmentEffect } from "./provider-planning.js";
import { authSchemaSource } from "./render-auth-schema.js";
import {
  databaseServiceSource,
  drizzleConfigSource,
  itemsSchemaSource,
} from "./render-database-sources.js";

/**
 * Plans database through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param request - Normalized scaffold request.
 * @returns The matched or planned database dialect, service path and schema path.
 */
export const renderDatabaseEffect = Effect.fn("Scaffold.renderDatabase")(
  function* (
    builder: PlanBuilder,
    request: Extract<AddRequest, { kind: "database" }>,
  ): Effect.fn.Return<
    RenderedDatabase,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    if (builder.discovery.services.some((service) => service.capability === "database")) {
      return yield* domainError(
        new AddScaffoldError(ADD_FAILURE_CODES.collision, "A database service already exists."),
      );
    }
    const servicePath = yield* domainTry(() =>
      scaffoldServiceBoundary(builder.discovery, "database"),
    );
    const schemaPath = `${dirname(servicePath)}/schema/index.ts`;
    yield* builder.createEffect(servicePath, databaseServiceSource(request.dialect));
    yield* builder.createEffect(
      schemaPath,
      request.authSchema ? authSchemaSource(request.dialect) : itemsSchemaSource(request.dialect),
    );
    yield* builder.createEffect(
      "drizzle.config.ts",
      drizzleConfigSource(request.dialect, schemaPath),
    );
    for (const dependency of ["@relkit/drizzle", "drizzle-orm", "drizzle-kit"] as const) {
      yield* builder.dependencyEffect(dependency);
    }
    yield* builder.scriptEffect("db:generate", "bun --bun drizzle-kit generate");
    yield* builder.scriptEffect("db:migrate", "relkit db migrate");
    if (request.dialect === "sqlite") {
      yield* ensureEnvironmentEffect(
        builder,
        "DATABASE_PATH",
        `env.string().default("./.relkit/state/app.sqlite")`,
        "./.relkit/state/app.sqlite",
      );
      yield* builder.gitignoreEffect("*.sqlite");
      yield* builder.gitignoreEffect("*.sqlite-*");
    } else {
      yield* ensureEnvironmentEffect(builder, "DATABASE_URL", "env.string()");
      yield* builder.warningEffect(
        "database-url-required",
        "Populate DATABASE_URL before starting the database service.",
      );
    }
    yield* builder.nextStepEffect("bun run db:generate");
    yield* builder.nextStepEffect("bun run db:migrate");
    yield* builder.registerArtifactEffect("service", {
      domain: "database",
      path: servicePath,
      binding: "database",
      id: "database",
    });
    return { dialect: request.dialect, servicePath, schemaPath };
  },
  (effect) => observeExecution("generator", "planning.renderDatabase", scaffoldErrors(effect)),
);

/**
 * Preserves the renderDatabase Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param request - Normalized scaffold request.
 * @returns The matched or planned database dialect, service path and schema path.
 */
export function renderDatabase(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "database" }>,
): Promise<RenderedDatabase> {
  return runGeneratorPromise(renderDatabaseEffect(builder, request));
}
