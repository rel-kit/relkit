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

import { AddResolutionState } from "./add-resolution-state.js";

import type { ProjectDiscovery } from "./project-discovery-types.js";

/**
 * Resolves resolve domain options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after kind-specific domain choices and identity are resolved.
 */
export const resolveDomainOptionsEffect = Effect.fn("AddResolution.resolveDomainOptions")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    const kind = state.parsed.kind;
    if (kind !== "database" && kind !== "auth" && kind !== "route") {
      yield* ensureNameEffect(state);
    }
    if (kind === "service") yield* serviceOptionsEffect(state);
    else if (kind === "function") yield* visibilityEffect(state);
    else if (kind === "event") {
      yield* visibilityEffect(state);
      yield* providerProfileEffect(state, discovery, "event");
    } else if (kind === "event-function") {
      yield* eventFunctionOptionsEffect(state, discovery);
    } else if (kind === "task") {
      yield* taskOptionsEffect(state);
    } else if (kind === "job") yield* jobOptionsEffect(state, discovery);
    else if (kind === "prompt" && !state.has("text")) yield* promptTextEffect(state);
  },
  (effect) =>
    observeExecution("generator", "add.resolve.resolveDomainOptions", scaffoldErrors(effect)),
);

/**
 * Preserves the existing resolveDomainOptions Promise API.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after the existing contract has been applied.
 */
export function resolveDomainOptions(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): Promise<void> {
  return runGeneratorPromise(
    resolveDomainOptionsEffect(state, discovery).pipe(
      Effect.provide(generatorPromptLayer(state.prompt ?? createClackPromptDriver())),
    ),
  );
}

import {
  promptTextEffect,
  ensureNameEffect,
  serviceOptionsEffect,
  visibilityEffect,
} from "./add-resolver-domain-input.js";
import {
  eventFunctionOptionsEffect,
  taskOptionsEffect,
  jobOptionsEffect,
  providerProfileEffect,
} from "./add-resolver-domain-execution.js";
