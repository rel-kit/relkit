/** Resolves platform routes and provider-backed features from normalized add options and project discovery facts. */

import { databaseOptionsEffect, authOptionsEffect } from "./add-resolver-auth.js";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "create-relkit/internal/generator-filesystem";
import { GeneratorPrompt, generatorPromptLayer } from "create-relkit/internal/generator-prompt";
import { createClackPromptDriver } from "create-relkit/internal/prompt-driver";
import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
  type GeneratorPromptError,
} from "create-relkit/internal/generator-errors";
import { runGeneratorPromise } from "create-relkit/internal/generator-runtime";
import { type RouteMethod } from "create-relkit/internal/add-types";
import { resolveServiceEffect, selectedDomain } from "./add-resolution-discovery.js";
import { AddResolutionState, choices, label } from "./add-resolution-state.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";
/** Route methods offered during interactive service-route resolution. */
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
