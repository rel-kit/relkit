import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import type { AddRequest } from "./add-types.js";
import { normalizeArtifactName } from "./add-name.js";
import {
  addPublicMemberEffect,
  assertAvailableId,
  domainArtifact,
  resolveArtifact,
  type DomainArtifact,
  type DomainTarget,
} from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { registerEffect } from "./render-domain-register.js";
import { ensureProviderProfileEffect } from "./provider-planning.js";
import { errorSource, eventFunctionSource, functionSource } from "./render-domain-sources.js";

import type { RenderedArtifact, RenderFunctionOptions } from "./render-domain.types.js";
/**
 * Plans function through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param nameValue - Requested artifact name before normalization.
 * @param options - Explicit options retaining existing defaults.
 * @returns The planned function source path and binding after request-state registration.
 */
export const renderFunctionEffect = Effect.fn("Scaffold.renderFunction")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    nameValue: string,
    options: RenderFunctionOptions = {},
  ): Effect.fn.Return<
    RenderedArtifact,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    const artifact = domainArtifact(target, nameValue, "functions", "function");
    assertAvailableId(builder, artifact.id);
    yield* builder.createEffect(artifact.path, functionSource(artifact, options));
    yield* registerEffect(builder, target, "function", artifact);
    if (!options.internal)
      yield* addPublicMemberEffect(builder, target, "functions", artifact, artifact.path);
    return artifact;
  },
  (effect) => observeExecution("generator", "planning.renderFunction", scaffoldErrors(effect)),
);

/**
 * Plans error through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param nameValue - Requested artifact name before normalization.
 * @returns The planned error source path and binding after request-state registration.
 */
export const renderErrorEffect = Effect.fn("Scaffold.renderError")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    nameValue: string,
  ): Effect.fn.Return<
    RenderedArtifact,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    const artifact = domainArtifact(target, nameValue, "errors", "error", "error");
    assertAvailableId(builder, artifact.id);
    yield* builder.createEffect(artifact.path, errorSource(artifact));
    yield* registerEffect(builder, target, "error", artifact);
    return artifact;
  },
  (effect) => observeExecution("generator", "planning.renderError", scaffoldErrors(effect)),
);

/**
 * Plans event function through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned event function source path and binding after request-state registration.
 */
export const renderEventFunctionEffect = Effect.fn("Scaffold.renderEventFunction")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    request: Extract<AddRequest, { kind: "event-function" }>,
  ): Effect.fn.Return<
    RenderedArtifact,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    const artifact = domainArtifact(target, request.name, "functions", "function");
    const event =
      target.service ||
      builder.artifacts.some(
        (item) => item.domain === target.domain.fileStem && item.kind === "event",
      )
        ? resolveArtifact(builder, target, "event", request.event)
        : yield* renderEventEffect(builder, target, request.event, {
            internal: false,
            ...(request.profile === undefined ? {} : { profile: request.profile }),
          });
    const profile = yield* ensureProviderProfileEffect(builder, "event", {
      requested: request.profile,
    });
    assertAvailableId(builder, artifact.id);
    yield* builder.createEffect(
      artifact.path,
      eventFunctionSource(
        artifact,
        event.id ?? `${target.domain.idSegment}.${normalizeArtifactName(event.binding).idSegment}`,
        request.delivery,
        profile,
      ),
    );
    yield* registerEffect(builder, target, "function", artifact);
    return artifact;
  },
  (effect) => observeExecution("generator", "planning.renderEventFunction", scaffoldErrors(effect)),
);

/**
 * Preserves the renderFunction Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param nameValue - Requested artifact name before normalization.
 * @param options - Explicit options retaining existing defaults.
 * @returns The planned function source path and binding after typed planning settles.
 */
export function renderFunction(
  builder: PlanBuilder,
  target: DomainTarget,
  nameValue: string,
  options: RenderFunctionOptions = {},
): Promise<RenderedArtifact> {
  return runGeneratorPromise(renderFunctionEffect(builder, target, nameValue, options));
}

/**
 * Preserves the renderError Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param nameValue - Requested artifact name before normalization.
 * @returns The planned error source path and binding after typed planning settles.
 */
export function renderError(
  builder: PlanBuilder,
  target: DomainTarget,
  nameValue: string,
): Promise<RenderedArtifact> {
  return runGeneratorPromise(renderErrorEffect(builder, target, nameValue));
}

/**
 * Preserves the renderEventFunction Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned event function source path and binding after typed planning settles.
 */
export function renderEventFunction(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "event-function" }>,
): Promise<RenderedArtifact> {
  return runGeneratorPromise(renderEventFunctionEffect(builder, target, request));
}

import { renderEventEffect } from "./render-domain-events.js";
