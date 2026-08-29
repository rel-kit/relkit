import { deepFreeze, type JsonValue, type SourceLocation } from "@relkit/contracts";
import { canonicalizeGraph, hashGraph, type GraphCanonicalizationOptions } from "./hash.js";
import type {
  AgentNode,
  ApplicationGraph,
  BucketNode,
  CacheNode,
  EventNode,
  EventTriggerConfig,
  FunctionNode,
  GraphNode,
  HttpTriggerConfig,
  JobNode,
  MiddlewareNode,
  ToolNode,
  TriggerNode,
} from "./model.js";
import type { ServiceNode } from "./service-nodes.js";

export interface FunctionRegistration extends FunctionNode {
  readonly serviceId?: string;
}
export type HttpTriggerRegistration = TriggerNode<"http", HttpTriggerConfig> & {
  readonly serviceId?: string;
};
export type QueueRegistration = JobNode | TriggerNode<"queue", JsonValue>;
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
export interface ServiceRegistration extends ServiceNode {}
export interface MiddlewareRegistration extends MiddlewareNode {}

export interface RegistrationPlan {
  readonly graphHash: string;
  readonly functions: readonly FunctionRegistration[];
  readonly httpTriggers: readonly HttpTriggerRegistration[];
  readonly queues: readonly QueueRegistration[];
  readonly schedules: readonly ScheduleRegistration[];
  readonly eventTriggers: readonly EventTriggerRegistration[];
  readonly events?: readonly EventRegistration[];
  readonly buckets: readonly BucketRegistration[];
  readonly caches: readonly CacheRegistration[];
  readonly tools: readonly ToolRegistration[];
  readonly agents: readonly AgentRegistration[];
  readonly services?: readonly ServiceRegistration[];
  readonly middlewares: readonly MiddlewareRegistration[];
}
type MutableRegistrationPlan = {
  -readonly [Key in keyof RegistrationPlan]-?: NonNullable<
    RegistrationPlan[Key]
  > extends readonly (infer Item)[]
    ? Item[]
    : NonNullable<RegistrationPlan[Key]>;
};

export function createRegistrationPlan(
  graph: ApplicationGraph,
  options: GraphCanonicalizationOptions = {},
): RegistrationPlan {
  const canonical = canonicalizeGraph(graph, options);
  const plan: MutableRegistrationPlan = {
    graphHash: hashGraph(canonical, options),
    functions: [],
    httpTriggers: [],
    queues: [],
    schedules: [],
    eventTriggers: [],
    events: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
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
  plan.schedules.sort(compareSchedule);
  return deepFreeze(plan);
}
function addNode(
  plan: MutableRegistrationPlan,
  node: GraphNode,
  serviceIds: ReadonlyMap<string, string>,
): void {
  switch (node.kind) {
    case "function":
      {
        const serviceId = serviceIds.get(node.id);
        plan.functions.push(serviceId === undefined ? node : { ...node, serviceId });
      }
      return;
    case "trigger":
      addTrigger(plan, node, serviceIds);
      return;
    case "job":
      plan.queues.push(node);
      addSchedules(plan.schedules, node);
      return;
    case "bucket":
      plan.buckets.push(node);
      return;
    case "cache":
      plan.caches.push(node);
      return;
    case "tool":
      plan.tools.push(node);
      return;
    case "agent":
      plan.agents.push(node);
      return;
    case "service":
      plan.services.push(node);
      return;
    case "event":
      plan.events.push(node);
      return;
    case "middleware":
      plan.middlewares.push(node);
      return;
    default:
      return;
  }
}

function addTrigger(
  plan: Parameters<typeof addNode>[0],
  node: TriggerNode,
  serviceIds: ReadonlyMap<string, string>,
): void {
  if (node.triggerType === "http") {
    const serviceId = serviceIds.get(node.targetFunctionId);
    plan.httpTriggers.push(
      (serviceId === undefined
        ? node
        : { ...node, serviceId }) as unknown as HttpTriggerRegistration,
    );
  } else if (node.triggerType === "event")
    plan.eventTriggers.push(node as unknown as EventTriggerRegistration);
  else if (node.triggerType === "queue")
    plan.queues.push(node as unknown as TriggerNode<"queue", JsonValue>);
  else plan.schedules.push(scheduleFromTrigger(node));
}

function addSchedules(output: ScheduleRegistration[], node: JobNode): void {
  if (!Array.isArray(node.schedule)) return;
  node.schedule.forEach((schedule, index) => {
    const id = isRecord(schedule) && typeof schedule.id === "string" ? schedule.id : String(index);
    output.push({ id: `${node.id}:${id}`, source: node.source, jobId: node.id, schedule });
  });
}
function scheduleFromTrigger(node: TriggerNode): ScheduleRegistration {
  const config = isRecord(node.config) ? node.config : {};
  const schedule = config.schedule ?? node.config;
  const jobId = typeof config.jobId === "string" ? config.jobId : node.targetFunctionId;
  return { id: node.id, source: node.source, jobId, schedule };
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

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
