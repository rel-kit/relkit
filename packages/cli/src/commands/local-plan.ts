import { LocalCommandError } from "./local-operation-support.js";

/**
 * Selects authored local services without changing any cohort metadata.
 * @typeParam T - Complete accepted plan retaining its existing metadata.
 * @param plan - Validated local plan.
 * @param service - Optional binding ID, profile or capability filter.
 * @returns The original plan or its selected service projection.
 */
export function selectPlan<
  T extends {
    readonly services: readonly {
      readonly bindingId: string;
      readonly profile: string;
      readonly capability: string;
    }[];
  },
>(plan: T, service: string | undefined): T {
  if (service === undefined) return plan;
  const services = plan.services.filter(
    (entry) =>
      entry.bindingId === service || entry.profile === service || entry.capability === service,
  );
  if (services.length === 0)
    throw new LocalCommandError(
      "RELKIT_LOCAL_SERVICE_NOT_FOUND",
      `Local service "${service}" is not declared.`,
    );
  return { ...plan, services };
}
