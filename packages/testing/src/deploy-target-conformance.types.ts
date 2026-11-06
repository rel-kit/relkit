/** Inputs of the shared deploy-target conformance suite. */
import type { DeployTarget } from "@relkit/cli/deploy-targets";
import type { ConformanceCase } from "./conformance.types.js";

/** What a deploy target supplies to run the suite. */
export interface DeployTargetConformanceOptions {
  /** The target under test, such as `railwayDeployTarget` from `@relkit/cli/deploy-targets`. */
  readonly target: DeployTarget;
  /** Project root passed to `plan`; it holds whatever project files the target reads. */
  readonly root: string;
  /**
   * A compiled application graph for targets that set `needsGraph`. The suite passes it as text
   * and also checks that a missing or broken graph is refused.
   */
  readonly graph?: unknown;
}

/** Case ids of the deploy-target suite. */
export type DeployTargetConformanceCaseId =
  | "naming"
  | "every-runtime"
  | "deterministic"
  | "relative-paths"
  | "ci-workflow"
  | "next-steps"
  | "graph-required";

/** One deploy-target conformance case. */
export type DeployTargetConformanceCase = ConformanceCase<DeployTargetConformanceCaseId>;
