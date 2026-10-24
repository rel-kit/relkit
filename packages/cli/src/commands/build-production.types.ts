/** Describes an already selected runtime package and its capability-specific peers. */
import type { IntegrationDependencyRequirement } from "@relkit/contracts";

/** Compiler plan and specialized services share this metadata-only production selection. */
export interface ProductionSelection {
  readonly packageName: string;
  readonly packageVersion?: string | undefined;
  readonly capabilities: readonly string[];
  readonly requirements?: readonly IntegrationDependencyRequirement[] | undefined;
}
