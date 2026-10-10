/**
 * Emits runtime registrations from the already checked preparation graph.
 * Prepared hosts receive the canonical frozen projection as sealed source;
 * production and safe edited generations keep the existing runtime planner.
 * Graph/hash disagreement aborts preparation before any snapshot publication.
 */
import { canonicalJson } from "@relkit/contracts";
import { createRegistrationPlan } from "@relkit/graph";
import type { ServerSourceEmission } from "./build-server.types.js";

/**
 * Projects preparation's complete graph without reevaluating user declarations.
 * @param input - Accepted graph, activation hash and emission configuration.
 * @returns Pure source; prepared plan bytes are covered by the entrypoint seal.
 * @throws TypeError when the accepted graph and supplied hash disagree.
 */
export function serverRegistrationPlanSource(input: ServerSourceEmission): string {
  if (input.configuration.httpApplication !== "prepared")
    return "const plan = createRegistrationPlan(graph);";
  const plan = createRegistrationPlan(input.graph);
  if (plan.graphHash !== input.graphHash)
    throw new TypeError("Prepared registration plan does not match the accepted graph.");
  return `const plan = deepFreeze(${canonicalJson(plan)});`;
}
