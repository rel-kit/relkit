/** Resolves bucket, cache and other resource selections into concrete add requests using the discovered provider profiles. */

import { agentOptionsEffect } from "./add-resolver-agent.js";
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
import { artifactOptions, artifacts, selectedDomain } from "./add-resolution-discovery.js";
import { AddResolutionState, choices } from "./add-resolution-state.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";
/**
 * Resolves resolve resource options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after cache, bucket, tool or agent choices are resolved.
 */
export const resolveResourceOptionsEffect = Effect.fn("AddResolution.resolveResourceOptions")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    const kind = state.parsed.kind;
    if (kind === "cache" || kind === "bucket") yield* providerSourceEffect(state, discovery, kind);
    else if (kind === "tool") yield* toolOptionsEffect(state, discovery);
    else if (kind === "agent") yield* agentOptionsEffect(state, discovery);
  },
  (effect) =>
    observeExecution("generator", "add.resolve.resolveResourceOptions", scaffoldErrors(effect)),
);
/**
 * Resolves tool options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after the callable target, side-effect and approval choices are recorded.
 */
const toolOptionsEffect = Effect.fn("AddResolution.toolOptions")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (!state.has("target") && !state.has("create-function")) {
      const values = artifacts(discovery, selectedDomain(state, discovery), "function");
      if (!state.interactive && values.length === 1)
        yield* state.optionEffect("target", values[0]!.id ?? values[0]!.binding);
      else if (state.interactive) {
        const create = "__create_function__";
        const value =
          values.length === 0
            ? create
            : yield* state.selectEffect("Callable function target", [
                ...artifactOptions(values),
                { value: create, label: "Create a new function" },
              ]);
        if (value === create) {
          const name = yield* state.textEffect(
            "Callable function name to create",
            state.parsed.positional,
            true,
          );
          if (name) yield* state.optionEffect("create-function", name);
        } else if (value) yield* state.optionEffect("target", value);
      }
    }
    if (!state.has("side-effect")) {
      const value = yield* state.selectEffect(
        "Side effect",
        choices(["none", "read", "write", "external"]),
        "read",
      );
      if (value) yield* state.optionEffect("side-effect", value);
    }
    if (!state.has("approval")) {
      const value = yield* state.selectEffect(
        "Approval policy",
        choices(["never", "on-write", "always"]),
        "never",
      );
      if (value) yield* state.optionEffect("approval", value);
    }
  },
  (effect) => observeExecution("generator", "add.resolve.toolOptions", scaffoldErrors(effect)),
);
/**
 * Preserves the existing resolveResourceOptions Promise API.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after the existing contract has been applied.
 */
export function resolveResourceOptions(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): Promise<void> {
  return runGeneratorPromise(
    resolveResourceOptionsEffect(state, discovery).pipe(
      Effect.provide(generatorPromptLayer(state.prompt ?? createClackPromptDriver())),
    ),
  );
}
import { providerSourceEffect } from "./add-resolver-provider.js";
