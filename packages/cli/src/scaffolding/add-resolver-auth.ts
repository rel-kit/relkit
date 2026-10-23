/** Resolves auth mode and backing database selections for existing-project additions without changing schema or migration state. */

import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "create-relkit/internal/generator-filesystem";
import { GeneratorPrompt } from "create-relkit/internal/generator-prompt";

import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
  type GeneratorPromptError,
} from "create-relkit/internal/generator-errors";

import { ADD_FAILURE_CODES, AddScaffoldError } from "create-relkit/internal/add-types";

import { AddResolutionState, choices } from "./add-resolution-state.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";
/**
 * Resolves database options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @returns Completion after ORM and database dialect choices are recorded.
 */
export const databaseOptionsEffect = Effect.fn("AddResolution.databaseOptions")(
  function* (
    state: AddResolutionState,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (!state.has("orm")) {
      const accepted = yield* state.confirmEffect("Use Drizzle ORM?", true);
      if (accepted === false) cancelled("Database scaffolding requires Drizzle ORM.");
      if (accepted) yield* state.optionEffect("orm", "drizzle");
    }
    if (!state.has("dialect")) {
      const dialect = yield* state.selectEffect(
        "Database dialect",
        choices(["sqlite", "postgresql", "mysql"]),
        "sqlite",
      );
      if (dialect) yield* state.optionEffect("dialect", dialect);
    }
  },
  (effect) => observeExecution("generator", "add.resolve.databaseOptions", scaffoldErrors(effect)),
);
/**
 * Resolves auth options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after authentication adapter, dialect and base path are recorded.
 */
export const authOptionsEffect = Effect.fn("AddResolution.authOptions")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (!state.has("adapter")) {
      const accepted = yield* state.confirmEffect("Use Better Auth?", true);
      if (accepted === false) cancelled("Auth scaffolding requires Better Auth.");
      if (accepted) yield* state.optionEffect("adapter", "better-auth");
    }
    const databases = discovery.services.filter((service) => service.capability === "database");
    if (!state.has("database-dialect") && databases.length === 1 && databases[0]!.dialect) {
      yield* state.optionEffect("database-dialect", databases[0]!.dialect!);
    } else if (!state.has("database-dialect") && state.interactive) {
      if (databases.length === 0) {
        const accepted = yield* state.confirmEffect(
          "No database exists. Create a Drizzle database first?",
          true,
        );
        if (accepted === false) cancelled("Auth requires a database service.");
      }
      const dialect = yield* state.selectEffect(
        "Database dialect",
        choices(["sqlite", "postgresql", "mysql"]),
        "sqlite",
      );
      if (dialect) yield* state.optionEffect("database-dialect", dialect);
    }
    if (!state.has("base-path")) {
      const path = yield* state.textEffect("Auth base path", "/api/auth");
      if (path) yield* state.optionEffect("base-path", path);
    }
  },
  (effect) => observeExecution("generator", "add.resolve.authOptions", scaffoldErrors(effect)),
);
/**
 * Rejects an explicitly cancelled setup choice.
 * @param message - User-facing diagnostic or prompt text.
 * @returns No value; throws AddScaffoldError with RELKIT_ADD_CANCELLED.
 */
function cancelled(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.cancellation, message);
}
