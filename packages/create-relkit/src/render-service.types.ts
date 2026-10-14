/**
 * Carries prerequisite callable/event/task artifacts between service-bundle planning
 * stages. Values refer to planned declarations only; filesystem publication and
 * resource lifetime remain owned by the generator transaction.
 */
import type { DomainArtifact } from "./domain-planning.types.js";

/** Resolved prerequisites used by job, tool, agent and route rendering. */
export interface ServicePrimaryArtifacts {
  readonly fn: DomainArtifact | undefined;
  readonly event: DomainArtifact | undefined;
  readonly task: DomainArtifact | undefined;
}
