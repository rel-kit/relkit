/**
 * Plans the application's Better Auth file and its service at the compiler-selected
 * layout; RelKit mounts the handler, so no route is planned. Existing databases retain their owner/schema/dialect; the transaction
 * owns source publication and no live client, migration or secret is created here.
 */

import { Effect } from "effect";
import { observeExecution } from "relkit/contracts/operation";
import { scaffoldErrors, domainError, domainTry } from "create-relkit/generator-errors";
import { runGeneratorPromise } from "create-relkit/generator-runtime";
import { ADD_FAILURE_CODES, AddScaffoldError, type AddRequest } from "create-relkit/add-types";
import type { PlanBuilder } from "./plan-builder.js";
import { scaffoldServiceBoundary } from "./scaffold-layout.js";
import { ensureEnvironmentEffect } from "./provider-planning.js";
import { authServiceSource, betterAuthFileSource } from "./render-auth-sources.js";
import { renderDatabaseEffect } from "./render-database.js";
import type { RenderedDatabase } from "./render-database.types.js";
import {
  addAuthSchemaEffect,
  existingDatabase,
  validateAuthBasePath,
} from "./render-auth-database.js";

/**
 * Plans native auth/database composition: the Better Auth file and its service.
 * @param builder - Per-request planning owner with declaration-only discovery.
 * @param request - Native dialect and static auth mount configuration.
 * @returns Lazy completion with typed scaffold/filesystem failures; no resource activation.
 */
export const renderAuthEffect = Effect.fn("Scaffold.renderAuth")(
  function* (builder: PlanBuilder, request: Extract<AddRequest, { kind: "auth" }>) {
    if (builder.discovery.services.some((service) => service.capability === "auth")) {
      return yield* domainError(
        new AddScaffoldError(ADD_FAILURE_CODES.collision, "An auth service already exists."),
      );
    }
    yield* domainTry(() => validateAuthBasePath(request.basePath));
    const existing = builder.discovery.services.filter(
      (service) => service.capability === "database",
    );
    if (existing.length > 1)
      return yield* domainError(
        new AddScaffoldError(ADD_FAILURE_CODES.collision, "Multiple database services exist."),
      );
    const found = existing[0];
    let database: RenderedDatabase;
    if (found) database = yield* domainTry(() => existingDatabase(found, request.databaseDialect));
    else
      database = yield* renderDatabaseEffect(builder, {
        kind: "database",
        projectRoot: builder.discovery.projectRoot,
        install: request.install,
        orm: "drizzle",
        dialect: request.databaseDialect,
        authSchema: true,
      });
    if (found) yield* addAuthSchemaEffect(builder, database);
    const servicePath = yield* domainTry(() => scaffoldServiceBoundary(builder.discovery, "auth"));
    yield* builder.createEffect(
      servicePath.replace(/[^/]+$/, "better-auth.ts"),
      betterAuthFileSource(request.basePath),
    );
    yield* builder.createEffect(servicePath, authServiceSource());
    yield* authEnvironmentEffect(builder);
    yield* builder.registerArtifactEffect("service", {
      domain: "auth",
      path: servicePath,
      binding: "auth",
      id: "auth",
    });
  },
  (effect) => observeExecution("generator", "planning.renderAuth", scaffoldErrors(effect)),
);

/**
 * Declares native dependencies and credential requirements without acquiring auth.
 * @param builder - Per-request source planning owner.
 * @returns Lazy environment/dependency edits and operational guidance.
 */
const authEnvironmentEffect = Effect.fn("Scaffold.authEnvironment")(function* (
  builder: PlanBuilder,
) {
  yield* builder.dependencyEffect("@relkit/better-auth");
  yield* builder.dependencyEffect("better-auth");
  yield* builder.dependencyEffect("@cloudflare/workers-types");
  yield* ensureEnvironmentEffect(builder, "BETTER_AUTH_SECRET", "env.secret()");
  // Both are required: the server refuses to start without them, with RELKIT_ENVIRONMENT_INVALID.
  yield* ensureEnvironmentEffect(builder, "BETTER_AUTH_URL", "env.url()", "http://127.0.0.1:3000");
  yield* builder.warningEffect(
    "auth-secret-required",
    "Populate BETTER_AUTH_SECRET with a strong secret and BETTER_AUTH_URL with the server's URL before starting auth.",
  );
  yield* builder.nextStepEffect("Set BETTER_AUTH_SECRET and BETTER_AUTH_URL in your environment.");
});

/**
 * Runs the existing Promise compatibility boundary after all source planning settles.
 * @param builder - Per-request planning owner.
 * @param request - Complete native authentication scaffold request.
 * @returns After planning, rejecting the preserved native scaffold error constructor.
 */
export function renderAuth(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "auth" }>,
): Promise<void> {
  return runGeneratorPromise(renderAuthEffect(builder, request));
}
