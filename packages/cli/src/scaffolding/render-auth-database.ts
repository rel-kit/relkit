/**
 * Validates an existing native database and adds Better Auth schema declarations
 * without changing its owner or dialect. Generator filesystem authority inspects
 * collisions; no client activation, migration, seed or credential edit occurs here.
 */

import { Effect } from "effect";
import { dirname, posix } from "node:path";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "create-relkit/internal/generator-filesystem";
import { scaffoldErrors, domainError } from "create-relkit/internal/generator-errors";
import { ADD_FAILURE_CODES, AddScaffoldError } from "create-relkit/internal/add-types";
import { authSchemaSource } from "./render-auth-schema.js";
import { addSourceExport } from "./source-edit.js";
import type { PlanBuilder } from "./plan-builder.js";
import type { DiscoveredService } from "./project-discovery-types.js";
import type { RenderedDatabase } from "./render-database.types.js";

const AUTH_TABLES = ["user", "session", "account", "verification"] as const;

/**
 * Plans native auth tables and their export after checking existing schema collisions.
 * @param builder - Per-request transaction planning owner.
 * @param database - Existing native database's matching dialect and schema paths.
 * @returns Lazy planned schema edits with typed filesystem/scaffold failures.
 */
export const addAuthSchemaEffect = Effect.fn("Scaffold.addAuthSchema")(
  function* (builder: PlanBuilder, database: RenderedDatabase) {
    const directory = dirname(database.schemaPath).replaceAll("\\", "/");
    yield* assertNoAuthTablesEffect(builder.discovery.projectRoot, directory);
    yield* builder.createEffect(`${directory}/auth.ts`, authSchemaSource(database.dialect));
    yield* builder.updateEffect(database.schemaPath, (source) =>
      addSourceExport(source, database.schemaPath, 'export * from "./auth.js";'),
    );
  },
  (effect) => observeExecution("generator", "planning.addAuthSchema", scaffoldErrors(effect)),
);

/**
 * Stops at the first deterministic schema collision before planning any auth edits.
 * @param root - Canonical application root.
 * @param directory - Existing database's physical schema directory.
 * @returns Lazy validation with GeneratorFileSystem required and typed collision failures.
 */
const assertNoAuthTablesEffect = Effect.fn("Scaffold.assertNoAuthTables")(
  function* (root: string, directory: string) {
    const fs = yield* GeneratorFileSystem;
    const files = yield* fs.glob(posix.join(root, directory), "**/*.ts");
    // Preserve first-collision order and avoid reading later modules after a rejection.
    for (const file of files) {
      const source = yield* fs.readText(posix.join(root, directory, file));
      if (AUTH_TABLES.some((name) => new RegExp(`\\bexport\\s+const\\s+${name}\\b`).test(source))) {
        return yield* domainError(
          new AddScaffoldError(
            ADD_FAILURE_CODES.collision,
            `The database schema already exports Better Auth table names (${file}).`,
          ),
        );
      }
    }
  },
  (effect) => observeExecution("generator", "planning.assertNoAuthTables", scaffoldErrors(effect)),
);

/**
 * Checks discovered schema/dialect compatibility before planning native auth tables.
 * @param service - Sole discovered native Drizzle service.
 * @param requested - Supported dialect requested by the auth scaffold.
 * @returns The existing service and schema paths with their validated dialect.
 * @throws AddScaffoldError for ambiguous schema metadata or a different native dialect.
 */
export function existingDatabase(
  service: DiscoveredService,
  requested: RenderedDatabase["dialect"],
): RenderedDatabase {
  if (!service.dialect || !service.schemaPath)
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.unsupportedSourceShape,
      "The existing database service has no statically discoverable dialect or schema import.",
    );
  if (service.dialect !== requested)
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.collision,
      `The existing database uses ${service.dialect}, not ${requested}.`,
    );
  return { dialect: service.dialect, servicePath: service.path, schemaPath: service.schemaPath };
}

/**
 * Requires a supported non-root static URL for the sole native auth mount.
 * @param value - Requested auth base URL path.
 * @returns Nothing when the mount can be represented by the existing route API.
 * @throws AddScaffoldError when path parameters or a root mount make it unsupported.
 */
export function validateAuthBasePath(value: string): void {
  if (!/^\/(?:[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*)?$/.test(value) || value === "/") {
    throw new AddScaffoldError(ADD_FAILURE_CODES.usage, `Invalid auth base path: ${value}`);
  }
}
