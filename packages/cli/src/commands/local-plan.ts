import { LocalCommandError } from "./local-operation-support.js";

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
