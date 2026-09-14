import { deepFreeze, type JsonValue, type SourceLocation } from "@relkit/contracts";
import { canonicalizeGraph, hashGraph, type GraphCanonicalizationOptions } from "./hash.js";
import { validateEventTargets } from "./event-validation.js";
import { addNode, type MutableRegistrationPlan } from "./registration-plan-add.js";
import type {
  AgentNode,
  ApplicationGraph,
  BucketNode,
  CacheNode,
  ChannelNode,
  EventNode,
  EventTriggerConfig,
  FunctionNode,
  HttpTriggerConfig,
  LegacyJobNode,
  MiddlewareNode,
  ToolNode,
  TaskJobNode,
  TaskNode,
  TriggerNode,
} from "./model.js";
import type { ServiceNode } from "./service-nodes.js";

export interface FunctionRegistration extends FunctionNode {
  readonly serviceId?: string;
}
export type HttpTriggerRegistration = TriggerNode<"http", HttpTriggerConfig> & {
  readonly serviceId?: string;
};
export type TaskRegistration = TaskNode;
export type JobRegistration = TaskJobNode;
export type QueueRegistration = LegacyJobNode | TriggerNode<"queue", JsonValue>;
export interface ScheduleRegistration {
  readonly id: string;
  readonly source: SourceLocation;
  readonly jobId: string;
  readonly schedule: JsonValue;
}
export type EventTriggerRegistration = TriggerNode<"event", EventTriggerConfig>;
export interface EventRegistration extends EventNode {}
export interface BucketRegistration extends BucketNode {}
export interface CacheRegistration extends CacheNode {}
export interface ToolRegistration extends ToolNode {}
export interface AgentRegistration extends AgentNode {}
export interface ChannelRegistration extends ChannelNode {}
export interface ServiceRegistration extends ServiceNode {}
export interface MiddlewareRegistration extends MiddlewareNode {}

export interface RegistrationPlan {
  readonly graphHash: string;
  readonly functions: readonly FunctionRegistration[];
  readonly httpTriggers: readonly HttpTriggerRegistration[];
  /** Task registrations are intentionally separate from legacy queues. */
  readonly tasks?: readonly TaskRegistration[];
  /** Task-backed job bindings are intentionally separate from legacy queues. */
  readonly jobs?: readonly JobRegistration[];
  readonly queues: readonly QueueRegistration[];
  readonly schedules: readonly ScheduleRegistration[];
  readonly eventTriggers: readonly EventTriggerRegistration[];
  readonly events?: readonly EventRegistration[];
  readonly buckets: readonly BucketRegistration[];
  readonly caches: readonly CacheRegistration[];
  readonly tools: readonly ToolRegistration[];
  readonly agents: readonly AgentRegistration[];
  readonly channels: readonly ChannelRegistration[];
  readonly services?: readonly ServiceRegistration[];
  readonly middlewares: readonly MiddlewareRegistration[];
}
export function createRegistrationPlan(
  graph: ApplicationGraph,
  options: GraphCanonicalizationOptions = {},
): RegistrationPlan {
  const canonical = canonicalizeGraph(graph, options);
  validateEventTargets(canonical);
  const plan: MutableRegistrationPlan = {
    graphHash: hashGraph(canonical, options),
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
  for (const node of canonical.nodes) addNode(plan, node, serviceIds);
  plan.httpTriggers.sort(compareHttpTrigger);
  plan.tasks.sort(compareRegistration);
  plan.jobs.sort(compareRegistration);
  plan.schedules.sort(compareSchedule);
  return deepFreeze(plan);
}

function compareRegistration(left: { readonly id: string }, right: { readonly id: string }): number {
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
