/**
 * Describes declaration-only scaffold artifact inputs and collected outputs.
 * Compiler syntax facts provide factory identity; scaffold discovery retains
 * exact physical source paths and does not import application modules.
 */
import type { AstPrefilterCandidate, AstSourceModule } from "@relkit/compiler";
import type { DiscoveredArtifact, DiscoveredService } from "./project-discovery-types.js";

/** One statically recognized descriptor factory and its source provenance. */
export interface FactoryContext {
  readonly modules: readonly AstSourceModule[];
  readonly candidate: AstPrefilterCandidate;
  readonly factory: AstPrefilterCandidate["facts"]["factoryBindings"][number];
  readonly source: string;
  readonly binding: string;
  readonly domain?: string;
}

/** Static service and artifact records used by add planning. */
export interface DiscoveredCollections {
  readonly services: readonly DiscoveredService[];
  readonly artifacts: readonly DiscoveredArtifact[];
}
