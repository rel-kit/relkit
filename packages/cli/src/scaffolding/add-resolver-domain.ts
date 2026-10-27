/** Coordinates domain artifact resolution through the existing service boundary before rendering an add plan. */

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

import { AddResolutionState } from "./add-resolution-state.js";

import type { ProjectDiscovery } from "./project-discovery-types.js";
import type { AddKind } from "create-relkit/internal/add-types";

/** Platform kinds identified by their project, path, or singleton role instead of a name. */
const NAMELESS_KINDS: ReadonlySet<AddKind> = new Set(["database", "auth", "route", "inspector"]);

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
    if (!NAMELESS_KINDS.has(kind)) {
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
