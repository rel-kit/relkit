import { type NormalizedArtifactName } from "./add-name.js";

import type { DiscoveredService } from "./project-discovery-types.js";

/**
 * Normalized domain identity and optional service used by artifact planning.
 */
export interface DomainTarget {
  readonly domain: NormalizedArtifactName;
  readonly servicePath: string;
  readonly service: DiscoveredService | undefined;
}

/**
 * Normalized artifact name, source path, descriptor ID, binding and export form.
 */
export interface DomainArtifact {
  readonly name: NormalizedArtifactName;
  readonly path: string;
  readonly id: string;
  readonly binding: string;
  readonly exportKind: "default" | "named";
}
