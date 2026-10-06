import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { ADD_FAILURE_CODES, AddScaffoldError, type AddRequest } from "./add-types.js";
import { bucketProfileOwnersEffect } from "./bucket-profiles.js";
import { assertAvailableId, domainArtifact, type DomainTarget } from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { ensureProviderProfileEffect } from "./provider-planning.js";
import { bucketSource, cacheSource } from "./render-resource-sources.js";
import type { RenderedArtifact } from "./render-domain.js";

/**
 * Plans cache through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned cache source path and binding after request-state registration.
 */
export const renderCacheEffect = Effect.fn("Scaffold.renderCache")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    request: Extract<AddRequest, { kind: "cache" }>,
  ): Effect.fn.Return<
    RenderedArtifact,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    const artifact = domainArtifact(target, request.name, "cache", "cache", "cache");
    assertAvailableId(builder, artifact.id);
    const profile = yield* ensureProviderProfileEffect(builder, "cache", {
      requested: request.profile,
      provider: request.provider,
      source: request.source,
    });
    yield* builder.createEffect(artifact.path, cacheSource(artifact, profile));
    yield* registerEffect(builder, target, "cache", artifact);
    return artifact;
  },
  (effect) => observeExecution("generator", "planning.renderCache", scaffoldErrors(effect)),
);

/**
 * Plans bucket through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned bucket source path and binding after request-state registration.
 */
export const renderBucketEffect = Effect.fn("Scaffold.renderBucket")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    request: Extract<AddRequest, { kind: "bucket" }>,
  ): Effect.fn.Return<
    RenderedArtifact,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    const artifact = domainArtifact(target, request.name, "buckets", "bucket", "bucket");
    assertAvailableId(builder, artifact.id);
    const owners = yield* bucketProfileOwnersEffect(
      { ...builder.discovery, artifacts: builder.artifacts, profiles: builder.profiles },
      (path) => builder.readEffect(path),
    );
    if (request.profile && owners.has(request.profile)) {
      throw new AddScaffoldError(
        ADD_FAILURE_CODES.collision,
        `Bucket profile "${request.profile}" is already owned by "${owners.get(request.profile)}". Choose an unused profile or a new provider source.`,
      );
    }
    const available = builder.profiles.filter(
      (item) => item.capability === "bucket" && !owners.has(item.name),
    );
    const reused =
      !request.provider && !request.source
        ? (available.find((item) => item.isDefault) ??
          (available.length === 1 ? available[0] : undefined))
        : undefined;
    const fresh = owners.size > 0 && !request.profile && !reused;
    let name = `${target.domain.fileStem}-${artifact.name.fileStem}`;
    for (
      let suffix = 2;
      builder.profiles.some((item) => item.capability === "bucket" && item.name === name);
      suffix++
    )
      name = `${target.domain.fileStem}-${artifact.name.fileStem}-${suffix}`;
    const profile = yield* ensureProviderProfileEffect(builder, "bucket", {
      requested: request.profile ?? reused?.name ?? (fresh ? name : undefined),
      provider: request.provider ?? (fresh ? "s3" : undefined),
      source: request.source ?? (fresh ? "docker" : undefined),
    });
    yield* builder.createEffect(artifact.path, bucketSource(artifact, profile));
    yield* registerEffect(builder, target, "bucket", artifact);
    return artifact;
  },
  (effect) => observeExecution("generator", "planning.renderBucket", scaffoldErrors(effect)),
);

/**
 * Composes register with explicit services, typed failures and owned resource lifetime.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param kind - Authoritative artifact kind.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @returns Completion after the authoritative artifact kind and projected identity enter request state.
 */
function registerEffect(
  builder: PlanBuilder,
  target: DomainTarget,
  kind: "cache" | "bucket",
  artifact: RenderedArtifact,
) {
  return builder.registerArtifactEffect(kind, {
    domain: target.domain.fileStem,
    path: artifact.path,
    binding: artifact.binding,
    id: artifact.id,
    exportKind: artifact.exportKind,
  });
}

/**
 * Preserves the renderCache Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned cache source path and binding after typed planning settles.
 */
export function renderCache(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "cache" }>,
): Promise<RenderedArtifact> {
  return runGeneratorPromise(renderCacheEffect(builder, target, request));
}

/**
 * Preserves the renderBucket Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned bucket source path and binding after typed planning settles.
 */
export function renderBucket(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "bucket" }>,
): Promise<RenderedArtifact> {
  return runGeneratorPromise(renderBucketEffect(builder, target, request));
}
