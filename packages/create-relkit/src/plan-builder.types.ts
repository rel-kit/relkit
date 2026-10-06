import type { ScaffoldFileOperation, ScaffoldWarning } from "./add-types.js";
import type { DiscoveredArtifact, DiscoveredProfile } from "./project-discovery-types.js";
import type { ScaffoldDependencyName } from "./scaffold-catalog.js";

/** One request's authoritative immutable planning state, held only in its owning Ref. */
export interface PlanBuilderState {
  readonly files: ReadonlyMap<string, ScaffoldFileOperation>;
  readonly dependencies: ReadonlySet<ScaffoldDependencyName>;
  readonly scripts: ReadonlyMap<string, string>;
  readonly warnings: ReadonlyMap<string, ScaffoldWarning>;
  readonly nextSteps: ReadonlySet<string>;
  readonly artifacts: readonly DiscoveredArtifact[];
  readonly profiles: readonly DiscoveredProfile[];
}

/** Artifact identity added to the current request's discovery view. */
export interface PlannedArtifactInput {
  readonly domain: string;
  readonly path: string;
  readonly binding: string;
  readonly id: string;
  readonly exportKind?: "default" | "named";
}
