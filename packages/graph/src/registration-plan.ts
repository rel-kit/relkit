import { deepFreezeEffect } from "@relkit/contracts";
import { Effect } from "effect";
import { validateEventTargetsEffect, GraphEventTargetsError } from "./event-validation.js";
import { observeGraph, runGraph } from "./graph-observability.js";
import { canonicalizeGraphEffect, hashGraphEffect } from "./hash.js";
import { GraphCanonicalizationError } from "./hash-errors.js";
import { addNodeEffect } from "./registration-plan-add.js";
import type { GraphCanonicalizationOptions } from "./hash.types.js";
import type { ApplicationGraph } from "./model.js";
import type { MutableRegistrationPlan } from "./registration-plan-add.types.js";
import type {
  HttpTriggerRegistration,
  RegistrationPlan,
  ScheduleRegistration,
} from "./registration-plan.types.js";
export type * from "./registration-plan.types.js";
/**
 * Projects canonical graph nodes into ordered runtime registrations.
 * @param graph - Application graph to project.
 * @param options - Source path normalization options.
 * @returns An Effect containing a frozen plan, or tagged graph, event, path, or JSON errors.
 * @example Effect.runSync(createRegistrationPlanEffect(graph));
 */
export function createRegistrationPlanEffect(
  graph: ApplicationGraph,
  options: GraphCanonicalizationOptions = {},
): Effect.Effect<
  RegistrationPlan,
  GraphEventTargetsError | GraphCanonicalizationError | import("./hash-errors.types.js").HashFailure
> {
  return observeGraph(
    "registration.create",
    Effect.gen(function* () {
      const canonical = yield* canonicalizeGraphEffect(graph, options);
      yield* validateEventTargetsEffect(canonical);
      const graphHash = yield* hashGraphEffect(canonical, options);
      const plan: MutableRegistrationPlan = {
        graphHash,
        functions: [],
        httpTriggers: [],
        tasks: [],
        jobs: [],
        queues: [],
        schedules: [],
        eventTriggers: [],
        events: [],
        buckets: [],
        caches: [],
        tools: [],
        agents: [],
        channels: [],
        services: [],
        middlewares: [],
      };
      const serviceIds = new Map<string, string>();
      for (const node of canonical.nodes)
        if (node.kind === "function" && node.domainId !== undefined) {
          serviceIds.set(node.id, node.domainId);
        }
      for (const node of canonical.nodes) yield* addNodeEffect(plan, node, serviceIds);
      plan.httpTriggers.sort(compareHttpTrigger);
      plan.tasks.sort(compareRegistration);
      plan.jobs.sort(compareRegistration);
      plan.schedules.sort(compareSchedule);
      return yield* deepFreezeEffect(plan);
    }),
  );
}
/**
 * Synchronous compatibility adapter for registration planning.
 * @param graph - Application graph to project.
 * @param options - Source path normalization options.
 * @returns A frozen and deterministically ordered registration plan.
 * @throws TypeError for invalid graph shapes or event targets; tagged contract errors for invalid paths or JSON.
 * @example createRegistrationPlan(graph);
 */
export function createRegistrationPlan(
  graph: ApplicationGraph,
  options: GraphCanonicalizationOptions = {},
): RegistrationPlan {
  try {
    return runGraph(createRegistrationPlanEffect(graph, options));
  } catch (error) {
    if (error instanceof GraphEventTargetsError || error instanceof GraphCanonicalizationError)
      throw new TypeError(error.message);
    throw error;
  }
}
function compareRegistration(
  left: { readonly id: string },
  right: { readonly id: string },
): number {
  return left.id.localeCompare(right.id);
}
function compareSchedule(left: ScheduleRegistration, right: ScheduleRegistration): number {
  return left.id.localeCompare(right.id) || left.jobId.localeCompare(right.jobId);
}
function compareHttpTrigger(left: HttpTriggerRegistration, right: HttpTriggerRegistration): number {
  // Keep all static routes ahead of parameters and wildcards; IDs make ties stable.
  return (
    routePrecedence(left.config.path) - routePrecedence(right.config.path) ||
    left.id.localeCompare(right.id)
  );
}
function routePrecedence(path: string): 0 | 1 | 2 | 3 {
  if (path.includes("*") && path.endsWith("?")) return 3;
  if (path.includes("*")) return 2;
  return path.split("/").some((segment) => segment.startsWith(":")) ? 1 : 0;
}
