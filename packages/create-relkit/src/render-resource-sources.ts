import type { DomainArtifact } from "./domain-planning.js";

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
