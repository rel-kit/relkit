import { Effect } from "effect";
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
 * Validated database dialect and planned/discovered service and schema paths.
 */
export interface RenderedDatabase {
  readonly dialect: Extract<AddRequest, { kind: "database" }>["dialect"];
  readonly servicePath: string;
  readonly schemaPath: string;
}

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
      throw new AddScaffoldError(ADD_FAILURE_CODES.collision, "A database service already exists.");
    }
    const servicePath = "src/database/service.ts";
    const schemaPath = "src/database/schema/index.ts";
    yield* builder.createEffect(servicePath, databaseServiceSource(request.dialect));
    yield* builder.createEffect(
      schemaPath,
      request.authSchema ? authSchemaSource(request.dialect) : itemsSchemaSource(request.dialect),
    );
    yield* builder.createEffect("drizzle.config.ts", drizzleConfigSource(request.dialect));
    for (const dependency of ["@relkit/drizzle", "drizzle-orm", "drizzle-kit"] as const) {
      yield* builder.dependencyEffect(dependency);
    }
    yield* builder.scriptEffect("db:generate", "bun --bun drizzle-kit generate");
    yield* builder.scriptEffect("db:migrate", "bun --bun drizzle-kit migrate");
    yield* builder.gitignoreEffect("/drizzle/");
    if (request.dialect === "sqlite") {
      yield* ensureEnvironmentEffect(
        builder,
        "DATABASE_PATH",
        `env.string().default("./app.sqlite")`,
        "./app.sqlite",
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
