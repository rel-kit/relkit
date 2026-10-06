import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { GeneratorPrompt, generatorPromptLayer } from "./generator-prompt.js";
import { createClackPromptDriver } from "./prompt-driver.js";
import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
  type GeneratorPromptError,
} from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { ADD_FAILURE_CODES, AddScaffoldError, type RouteMethod } from "./add-types.js";
import { resolveServiceEffect, selectedDomain } from "./add-resolution-discovery.js";
import { AddResolutionState, choices, label } from "./add-resolution-state.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";

/**
 * Route methods offered during interactive service-route resolution.
 */
const METHODS: readonly RouteMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

/**
 * Resolves resolve platform options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after route, database or authentication choices are resolved.
 */
export const resolvePlatformOptionsEffect = Effect.fn("AddResolution.resolvePlatformOptions")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    const kind = state.parsed.kind;
    if (kind === "route") yield* routeOptionsEffect(state, discovery);
    else if (kind === "middleware" && !state.has("path")) {
      const path = yield* state.textEffect("Middleware route scope", "*");
      if (path) yield* state.optionEffect("path", path);
    } else if (kind === "database") yield* databaseOptionsEffect(state);
    else if (kind === "auth") yield* authOptionsEffect(state, discovery);
  },
  (effect) =>
    observeExecution("generator", "add.resolve.resolvePlatformOptions", scaffoldErrors(effect)),
);

/**
 * Resolves route options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after route mode, path and method mappings are recorded.
 */
const routeOptionsEffect = Effect.fn("AddResolution.routeOptions")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (!state.parsed.positional) {
      const path = yield* state.textEffect("Route path", "/");
      if (path) yield* state.positionalEffect(path);
    }
    if (!state.has("mode")) {
      const mode = yield* state.selectEffect(
        "Route type",
        [
          { value: "route", label: "Route", hint: "standalone GET handler" },
          { value: "service-route", label: "Service route", hint: "map methods to public members" },
        ],
        "route",
      );
      if (mode) yield* state.optionEffect("mode", mode);
    }
    if (state.parsed.values.get("mode")?.[0] !== "service-route") return;
    yield* resolveServiceEffect(state, discovery);
    if (state.has("map") || !state.interactive) return;
    const methods = yield* state.multiselectEffect("HTTP methods", choices(METHODS), true);
    if (!methods) return;
    const domain = selectedDomain(state, discovery);
    const service = discovery.services.find(
      (item) => item.capability === "generic" && item.domain === domain,
    );
    for (const method of methods) {
      if (service?.members.length) {
        const member = yield* state.selectEffect(
          `${method} public member`,
          service.members.map((item) => ({
            value: item.name,
            label: label(item.name),
          })),
        );
        if (member) yield* state.appendEffect("--map", `${method}=${member}`);
      } else {
        const member = yield* state.textEffect(`${method} function to create`, "Example", true);
        if (member) yield* state.appendEffect("--map", `${method}=${member}`);
      }
    }
  },
  (effect) => observeExecution("generator", "add.resolve.routeOptions", scaffoldErrors(effect)),
);

/**
 * Resolves database options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @returns Completion after ORM and database dialect choices are recorded.
 */
const databaseOptionsEffect = Effect.fn("AddResolution.databaseOptions")(
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
const authOptionsEffect = Effect.fn("AddResolution.authOptions")(
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

/**
 * Preserves the existing resolvePlatformOptions Promise API.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after the existing contract has been applied.
 */
export function resolvePlatformOptions(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): Promise<void> {
  return runGeneratorPromise(
    resolvePlatformOptionsEffect(state, discovery).pipe(
      Effect.provide(generatorPromptLayer(state.prompt ?? createClackPromptDriver())),
    ),
  );
}
