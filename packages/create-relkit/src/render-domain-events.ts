import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";

import {
  addPublicMemberEffect,
  assertAvailableId,
  domainArtifact,
  type DomainTarget,
} from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { registerEffect } from "./render-domain-register.js";
import { ensureProviderProfileEffect } from "./provider-planning.js";
import { constantsSource, eventSource, promptSource } from "./render-domain-sources.js";

import type { RenderedArtifact, RenderEventOptions } from "./render-domain.types.js";
/**
 * Plans event through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param nameValue - Requested artifact name before normalization.
 * @param options - Explicit options retaining existing defaults.
 * @returns The planned event source path and binding after request-state registration.
 */
export const renderEventEffect = Effect.fn("Scaffold.renderEvent")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    nameValue: string,
    options: RenderEventOptions = {},
  ): Effect.fn.Return<
    RenderedArtifact,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    const artifact = domainArtifact(target, nameValue, "events", "event", "event");
    assertAvailableId(builder, artifact.id);
    const profile = yield* ensureProviderProfileEffect(builder, "event", {
      requested: options.profile,
    });
    yield* builder.createEffect(artifact.path, eventSource(artifact, profile));
    yield* registerEffect(builder, target, "event", artifact);
    if (!options.internal)
      yield* addPublicMemberEffect(builder, target, "events", artifact, artifact.path);
    return artifact;
  },
  (effect) => observeExecution("generator", "planning.renderEvent", scaffoldErrors(effect)),
);

/**
 * Plans prompt through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param nameValue - Requested artifact name before normalization.
 * @param text - Declared prompt text entries.
 * @returns The planned prompt source path and binding after request-state registration.
 */
export const renderPromptEffect = Effect.fn("Scaffold.renderPrompt")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    nameValue: string,
    text: readonly string[],
  ): Effect.fn.Return<
    RenderedArtifact,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    const artifact = domainArtifact(target, nameValue, "prompts", "prompt", "prompt");
    assertAvailableId(builder, artifact.id);
    yield* builder.createEffect(artifact.path, promptSource(artifact, text));
    yield* registerEffect(builder, target, "prompt", artifact);
    return artifact;
  },
  (effect) => observeExecution("generator", "planning.renderPrompt", scaffoldErrors(effect)),
);

/**
 * Plans constants through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param nameValue - Requested artifact name before normalization.
 * @returns The planned constants source path and binding after request-state registration.
 */
export const renderConstantsEffect = Effect.fn("Scaffold.renderConstants")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    nameValue: string,
  ): Effect.fn.Return<
    RenderedArtifact,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    const artifact = domainArtifact(target, nameValue, "constants", "constants", "constants");
    assertAvailableId(builder, artifact.id);
    yield* builder.createEffect(artifact.path, constantsSource(artifact));
    yield* registerEffect(builder, target, "constants", artifact);
    return artifact;
  },
  (effect) => observeExecution("generator", "planning.renderConstants", scaffoldErrors(effect)),
);

/**
 * Preserves the renderEvent Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param nameValue - Requested artifact name before normalization.
 * @param options - Explicit options retaining existing defaults.
 * @returns The planned event source path and binding after typed planning settles.
 */
export function renderEvent(
  builder: PlanBuilder,
  target: DomainTarget,
  nameValue: string,
  options: RenderEventOptions = {},
): Promise<RenderedArtifact> {
  return runGeneratorPromise(renderEventEffect(builder, target, nameValue, options));
}

/**
 * Preserves the renderPrompt Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param nameValue - Requested artifact name before normalization.
 * @param text - Declared prompt text entries.
 * @returns The planned prompt source path and binding after typed planning settles.
 */
export function renderPrompt(
  builder: PlanBuilder,
  target: DomainTarget,
  nameValue: string,
  text: readonly string[],
): Promise<RenderedArtifact> {
  return runGeneratorPromise(renderPromptEffect(builder, target, nameValue, text));
}

/**
 * Preserves the renderConstants Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param nameValue - Requested artifact name before normalization.
 * @returns The planned constants source path and binding after typed planning settles.
 */
export function renderConstants(
  builder: PlanBuilder,
  target: DomainTarget,
  nameValue: string,
): Promise<RenderedArtifact> {
  return runGeneratorPromise(renderConstantsEffect(builder, target, nameValue));
}
