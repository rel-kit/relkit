import { ADD_FAILURE_CODES, AddScaffoldError, type AddRequest } from "./add-types.js";
import { bucketProfileOwners } from "./bucket-profiles.js";
import { assertAvailableId, domainArtifact, type DomainTarget } from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { ensureProviderProfile } from "./provider-planning.js";
import { bucketSource, cacheSource } from "./render-resource-sources.js";
import type { RenderedArtifact } from "./render-domain.js";

export async function renderCache(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "cache" }>,
): Promise<RenderedArtifact> {
  const artifact = domainArtifact(target, request.name, "cache", "cache", "cache");
  assertAvailableId(builder, artifact.id);
  const profile = await ensureProviderProfile(builder, "cache", {
    requested: request.profile,
    provider: request.provider,
    source: request.source,
  });
  await builder.create(artifact.path, cacheSource(artifact, profile));
  register(builder, target, "cache", artifact);
  return artifact;
}

export async function renderBucket(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "bucket" }>,
): Promise<RenderedArtifact> {
  const artifact = domainArtifact(target, request.name, "buckets", "bucket", "bucket");
  assertAvailableId(builder, artifact.id);
  const owners = await bucketProfileOwners(
    { ...builder.discovery, artifacts: builder.artifacts, profiles: builder.profiles },
    (path) => builder.read(path),
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
  const profile = await ensureProviderProfile(builder, "bucket", {
    requested: request.profile ?? reused?.name ?? (fresh ? name : undefined),
    provider: request.provider ?? (fresh ? "s3" : undefined),
    source: request.source ?? (fresh ? "docker" : undefined),
  });
  await builder.create(artifact.path, bucketSource(artifact, profile));
  register(builder, target, "bucket", artifact);
  return artifact;
}

function register(
  builder: PlanBuilder,
  target: DomainTarget,
  kind: "cache" | "bucket",
  artifact: RenderedArtifact,
): void {
  builder.registerArtifact(kind, {
    domain: target.domain.fileStem,
    path: artifact.path,
    binding: artifact.binding,
    id: artifact.id,
    exportKind: artifact.exportKind,
  });
}
