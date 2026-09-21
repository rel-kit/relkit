import type { DomainTarget, DomainArtifact } from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";

export function register(
  builder: PlanBuilder,
  target: DomainTarget,
  kind: "function" | "error" | "event" | "task" | "job" | "prompt" | "constants",
  artifact: DomainArtifact,
): void {
  builder.registerArtifact(kind, {
    domain: target.domain.fileStem,
    path: artifact.path,
    binding: artifact.binding,
    id: artifact.id,
    exportKind: artifact.exportKind,
  });
}
