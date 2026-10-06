import type { DomainArtifact } from "./domain-planning.js";

/**
 * Renders cache Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param profile - Selected provider profile.
 * @returns Cache descriptor source including schemas and bounded example TTL values.
 */
export function cacheSource(artifact: DomainArtifact, profile: string): string {
  return `import { defineCache } from "@relkit/app/cache";
import { z } from "@relkit/app/schema";

const ${artifact.binding} = defineCache({
  id: "${artifact.id}",
  profile: "${profile}",
  key: z.string().min(1),
  value: z.string(),
  defaultTtlMs: 60_000,
  maxTtlMs: 300_000,
});

export default ${artifact.binding};
`;
}

/**
 * Renders bucket Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param profile - Selected provider profile.
 * @returns Bucket descriptor source including private visibility and example object limits.
 */
export function bucketSource(artifact: DomainArtifact, profile: string): string {
  return `import { defineBucket } from "@relkit/app/buckets";

const ${artifact.binding} = defineBucket({
  id: "${artifact.id}",
  profile: "${profile}",
  visibility: "private",
  maxObjectBytes: 5_000_000,
  allowedContentTypes: ["application/json"],
});

export default ${artifact.binding};
`;
}
