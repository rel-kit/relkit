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

import {
  artifactOptions,
  artifacts,
  profiles,
  selectedDomain,
} from "./add-resolution-discovery.js";

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
 * Resolves agent options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after model, tool and instruction choices are recorded.
 */
const agentOptionsEffect = Effect.fn("AddResolution.agentOptions")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    const domain = selectedDomain(state, discovery);
    if (!state.has("model")) {
      const models = profiles(discovery, "model");
      const preferred =
        models.find((profile) => profile.isDefault) ??
        (models.length === 1 ? models[0] : undefined);
      if (!state.interactive && preferred)
        yield* state.optionEffect("model", modelValue(preferred));
      else if (state.interactive) yield* selectModelEffect(state, models);
    }
    if (!state.has("tool")) {
      const tools = artifacts(discovery, domain, "tool");
      if (tools.length > 0) {
        const values = yield* state.multiselectEffect("Tools to include", artifactOptions(tools));
        if (values) yield* state.repeatedEffect("tool", values);
      }
    }
    if (state.has("prompt") || state.has("instructions")) return;
    const promptValues = artifacts(discovery, domain, "prompt");
    if (!state.interactive && promptValues.length === 1) {
      yield* state.optionEffect("prompt", promptValues[0]!.id ?? promptValues[0]!.binding);
      return;
    }
    if (!state.interactive) return;
    const inline = "__inline__";
    const selected = yield* state.selectEffect(
      "Agent instructions",
      [...artifactOptions(promptValues), { value: inline, label: "Inline instructions" }],
      inline,
    );
    if (selected === inline) {
      const text = yield* state.textEffect("Instructions");
      if (text) yield* state.optionEffect("instructions", text);
    } else if (selected) yield* state.optionEffect("prompt", selected);
  },
  (effect) => observeExecution("generator", "add.resolve.agentOptions", scaffoldErrors(effect)),
);

/**
 * Resolves a model profile and its optional declared model ID.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param models - Source-discovered model provider profiles.
 * @returns Completion after the selected model profile/ID is recorded in request state.
 */
const selectModelEffect = Effect.fn("AddResolution.selectModel")(
  function* (
    state: AddResolutionState,
    models: ReturnType<typeof profiles>,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    const preferred = models.find((profile) => profile.isDefault) ?? models[0];
    if (!preferred) return;
    const selected = yield* state.selectEffect(
      "Model",
      models.map((profile) => ({
        value: modelValue(profile),
        label: modelValue(profile),
        ...(profile.isDefault ? { hint: "configured default" } : {}),
      })),
      modelValue(preferred),
    );
    if (selected) yield* state.optionEffect("model", selected);
  },
  (effect) => observeExecution("generator", "add.resolve.selectModel", scaffoldErrors(effect)),
);

/**
 * Formats a discovered model profile for the model selection flag.
 * @param profile - Selected provider profile.
 * @returns The profile name, optionally followed by its statically declared model ID.
 */
function modelValue(profile: { readonly name: string; readonly modelId?: string }): string {
  return profile.modelId ? `${profile.name}:${profile.modelId}` : profile.name;
}

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
