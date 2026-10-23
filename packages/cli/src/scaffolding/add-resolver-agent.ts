/** Resolves native agent model, tool and instruction choices from the existing project before native scaffold sources are planned. */

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

import {
  artifactOptions,
  artifacts,
  profiles,
  selectedDomain,
} from "./add-resolution-discovery.js";
import { AddResolutionState } from "./add-resolution-state.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";
/**
 * Resolves agent options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after model, tool and instruction choices are recorded.
 */
export const agentOptionsEffect = Effect.fn("AddResolution.agentOptions")(
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
