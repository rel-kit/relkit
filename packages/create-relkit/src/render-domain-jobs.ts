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

import {
  addPublicMemberEffect,
  assertAvailableId,
  domainArtifact,
  resolveArtifact,
  sourceModule,
  type DomainTarget,
} from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { registerEffect } from "./render-domain-register.js";
import { ensureProviderProfileEffect } from "./provider-planning.js";
import { jobSource, taskJobSource, taskSource } from "./render-domain-sources.js";

import type { RenderedArtifact } from "./render-domain.types.js";
/**
 * Plans job through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned job source path and binding after request-state registration.
 */
export const renderJobEffect = Effect.fn("Scaffold.renderJob")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    request: Extract<AddRequest, { kind: "job" }>,
  ): Effect.fn.Return<
    RenderedArtifact,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    const artifact = domainArtifact(target, request.name, "jobs", "job", "job");
    const taskTarget = builder.artifacts.find(
      (item) =>
        item.domain === target.domain.fileStem &&
        item.kind === "task" &&
        [item.id, item.binding, item.path.split("/").at(-1)?.split(".")[0]].includes(
          request.target,
        ),
    );
    if (taskTarget) {
      const profile = yield* ensureProviderProfileEffect(builder, "job", {
        requested: request.profile,
      });
      const artifact = domainArtifact(target, request.name, "jobs", "job", "job");
      assertAvailableId(builder, artifact.id);
      yield* builder.createEffect(
        artifact.path,
        taskJobSource(
          artifact,
          taskTarget,
          sourceModule(taskTarget.path),
          profile,
          target.domain.identifier,
        ),
      );
      yield* registerEffect(builder, target, "job", artifact);
      yield* addPublicMemberEffect(builder, target, "jobs", artifact, artifact.path);
      return artifact;
    }
    const functionTarget =
      target.service ||
      builder.artifacts.some(
        (item) => item.domain === target.domain.fileStem && item.kind === "function",
      )
        ? resolveArtifact(builder, target, "function", request.target)
        : yield* renderFunctionEffect(builder, target, request.target);
    const profile = yield* ensureProviderProfileEffect(builder, "job", {
      requested: request.profile,
      legacy: true,
    });
    assertAvailableId(builder, artifact.id);
    yield* builder.createEffect(
      artifact.path,
      jobSource(artifact, functionTarget, sourceModule(functionTarget.path), profile),
    );
    yield* registerEffect(builder, target, "job", artifact);
    yield* addPublicMemberEffect(builder, target, "jobs", artifact, artifact.path);
    return artifact;
  },
  (effect) => observeExecution("generator", "planning.renderJob", scaffoldErrors(effect)),
);

/**
 * Plans task through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned task source path and binding after request-state registration.
 */
export const renderTaskEffect = Effect.fn("Scaffold.renderTask")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    request: Extract<AddRequest, { kind: "task" }>,
  ): Effect.fn.Return<
    RenderedArtifact,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    const artifact = domainArtifact(target, request.name, "tasks", "task", "task");
    assertAvailableId(builder, artifact.id);
    yield* builder.createEffect(
      artifact.path,
      taskSource(artifact, request.version, request.execution),
    );
    yield* registerEffect(builder, target, "task", artifact);
    yield* addPublicMemberEffect(builder, target, "tasks", artifact, artifact.path);
    return artifact;
  },
  (effect) => observeExecution("generator", "planning.renderTask", scaffoldErrors(effect)),
);

/**
 * Preserves the renderJob Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned job source path and binding after typed planning settles.
 */
export function renderJob(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "job" }>,
): Promise<RenderedArtifact> {
  return runGeneratorPromise(renderJobEffect(builder, target, request));
}

/**
 * Preserves the renderTask Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned task source path and binding after typed planning settles.
 */
export function renderTask(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "task" }>,
): Promise<RenderedArtifact> {
  return runGeneratorPromise(renderTaskEffect(builder, target, request));
}

import { renderFunctionEffect } from "./render-domain-callables.js";
