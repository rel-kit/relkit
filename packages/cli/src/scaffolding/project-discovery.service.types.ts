/** Composes source inspection and filesystem discovery into service, artifact and provider facts used by CLI scaffolding resolution. This companion contains the shared planning contracts without executing work. */

import type { Effect } from "effect";
import type {
  GeneratorDomainError,
  GeneratorIoError,
} from "create-relkit/internal/generator-errors";
import type { ProjectDiscovery } from "./project-discovery-types.js";

/** Declaration-only discovery service consumed by planning and interactive add resolution. */
export interface ProjectDiscoveryService {
  /**
   * Inspects project source declarations without executing user modules.
   * @param projectRoot - Absolute project root.
   * @returns An Effect returning deterministic app, provider, database and artifact facts.
   */
  readonly discover: (
    projectRoot: string,
  ) => Effect.Effect<ProjectDiscovery, GeneratorDomainError | GeneratorIoError>;
}
