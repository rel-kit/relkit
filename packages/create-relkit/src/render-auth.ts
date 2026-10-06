import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { dirname, posix } from "node:path";
import { routePathToFilePath } from "@relkit/compiler";
import { ADD_FAILURE_CODES, AddScaffoldError, type AddRequest } from "./add-types.js";
import { PlanBuilder } from "./plan-builder.js";
import type { DiscoveredService } from "./project-discovery-types.js";
import { ensureEnvironmentEffect } from "./provider-planning.js";
import { authSchemaSource } from "./render-auth-schema.js";
import { authRouteSource, authServiceSource } from "./render-auth-sources.js";
import { renderDatabaseEffect, type RenderedDatabase } from "./render-database.js";
import { addSourceExport } from "./source-edit.js";

/**
 * Authentication table names reserved by the generated schema.
 */
const AUTH_TABLES = ["user", "session", "account", "verification"] as const;

/**
 * Plans auth through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param request - Normalized scaffold request.
 * @returns Completion after auth service, schema, routes and dependencies are planned.
 */
export const renderAuthEffect = Effect.fn("Scaffold.renderAuth")(
  function* (
    builder: PlanBuilder,
    request: Extract<AddRequest, { kind: "auth" }>,
  ): Effect.fn.Return<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    if (builder.discovery.services.some((service) => service.capability === "auth")) {
      collision("An auth service already exists.");
    }
    validateBasePath(request.basePath);
    const existing = builder.discovery.services.filter(
      (service) => service.capability === "database",
    );
    if (existing.length > 1) collision("Multiple database services exist.");
    const database = existing[0]
      ? existingDatabase(existing[0], request.databaseDialect)
      : yield* renderDatabaseEffect(builder, {
          kind: "database",
          projectRoot: builder.discovery.projectRoot,
          install: request.install,
          orm: "drizzle",
          dialect: request.databaseDialect,
          authSchema: true,
        });
    if (existing[0]) yield* addAuthSchemaEffect(builder, database);
    yield* builder.createEffect("src/auth/service.ts", authServiceSource());
    yield* builder.createEffect(
      routePathToFilePath(`${request.basePath}/*auth?`),
      authRouteSource(),
    );
    yield* builder.dependencyEffect("@relkit/better-auth");
    yield* builder.dependencyEffect("better-auth");
    yield* ensureEnvironmentEffect(builder, "BETTER_AUTH_SECRET", "env.secret()");
    yield* ensureEnvironmentEffect(
      builder,
      "BETTER_AUTH_URL",
      `env.url().default(new URL("http://127.0.0.1:3000"))`,
      "http://127.0.0.1:3000",
    );
    yield* builder.warningEffect(
      "auth-secret-required",
      "Populate BETTER_AUTH_SECRET with a strong secret before starting auth.",
    );
    yield* builder.nextStepEffect("Set BETTER_AUTH_SECRET in your environment.");
    yield* builder.registerArtifactEffect("service", {
      domain: "auth",
      path: "src/auth/service.ts",
      binding: "auth",
      id: "auth",
    });
  },
  (effect) => observeExecution("generator", "planning.renderAuth", scaffoldErrors(effect)),
);

/**
 * Plans add auth schema through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param database - Validated database dialect and service/schema source paths.
 * @returns Completion after collision checks and auth schema/index exports are planned.
 */
const addAuthSchemaEffect = Effect.fn("Scaffold.addAuthSchema")(
  function* (
    builder: PlanBuilder,
    database: RenderedDatabase,
  ): Effect.fn.Return<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    const directory = dirname(database.schemaPath).replaceAll("\\", "/");
    yield* assertNoAuthTablesEffect(builder.discovery.projectRoot, directory);
    yield* builder.createEffect(`${directory}/auth.ts`, authSchemaSource(database.dialect));
    yield* builder.updateEffect(database.schemaPath, (source) =>
      addSourceExport(source, database.schemaPath, `export * from "./auth.js";`),
    );
  },
  (effect) => observeExecution("generator", "planning.addAuthSchema", scaffoldErrors(effect)),
);

/**
 * Plans assert no auth tables through the owning request and typed filesystem authority.
 * @param root - Absolute project or owned resource root.
 * @param directory - Project-relative schema directory inspected for existing auth tables.
 * @returns Completion when no supported auth table already exists in the schema directory.
 */
const assertNoAuthTablesEffect = Effect.fn("Scaffold.assertNoAuthTables")(
  function* (
    root: string,
    directory: string,
  ): Effect.fn.Return<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    const fs = yield* GeneratorFileSystem;
    const files = yield* fs.glob(posix.join(root, directory), "**/*.ts");
    for (const file of files) {
      const source = yield* fs.readText(posix.join(root, directory, file));
      if (AUTH_TABLES.some((name) => new RegExp(`\\bexport\\s+const\\s+${name}\\b`).test(source))) {
        collision(`The database schema already exports Better Auth table names (${file}).`);
      }
    }
  },
  (effect) => observeExecution("generator", "planning.assertNoAuthTables", scaffoldErrors(effect)),
);

/**
 * Checks a discovered database's static schema and dialect before auth planning.
 * @param service - Discovered database service.
 * @param requested - Dialect required by the requested authentication adapter.
 * @returns Existing service/schema paths and its matching dialect.
 */
function existingDatabase(
  service: DiscoveredService,
  requested: RenderedDatabase["dialect"],
): RenderedDatabase {
  if (!service.dialect || !service.schemaPath) {
    unsupported(
      "The existing database service has no statically discoverable dialect or schema import.",
    );
  }
  if (service.dialect !== requested) {
    collision(`The existing database uses ${service.dialect}, not ${requested}.`);
  }
  return { dialect: service.dialect, servicePath: service.path, schemaPath: service.schemaPath };
}

/**
 * Requires a non-root static URL path for authentication routes.
 * @param value - Requested auth base path.
 * @returns Completion for a supported path; invalid paths raise a usage error.
 */
function validateBasePath(value: string): void {
  if (!/^\/(?:[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*)?$/.test(value) || value === "/") {
    usage(`Invalid auth base path: ${value}`);
  }
}

/**
 * Rejects an existing declaration that conflicts with planned output.
 * @param message - Diagnostic explaining the conflicting declaration.
 * @returns No value; throws AddScaffoldError with RELKIT_ADD_COLLISION.
 */
function collision(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.collision, message);
}
/**
 * Rejects source that cannot be edited safely.
 * @param message - Diagnostic explaining the unsupported source shape.
 * @returns No value; throws the canonical unsupported-source AddScaffoldError.
 */
function unsupported(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.unsupportedSourceShape, message);
}
/**
 * Rejects unsupported or incomplete scaffold arguments.
 * @param message - Diagnostic explaining the unsupported arguments.
 * @returns No value; throws AddScaffoldError with RELKIT_ADD_USAGE.
 */
function usage(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.usage, message);
}

/**
 * Preserves the renderAuth Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param request - Normalized scaffold request.
 * @returns Completion after the existing contract has been applied.
 */
export function renderAuth(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "auth" }>,
): Promise<void> {
  return runGeneratorPromise(renderAuthEffect(builder, request));
}
