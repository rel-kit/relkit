import type { JsonValue, SourceLocation } from "@relkit/contracts";
import type {
  AgentNode,
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
import type { ServiceNode } from "./service-nodes.types.js";

/**
 * Function node projected into a runtime registration plan.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: FunctionRegistration): void => { console.log(value); };
 */
export interface FunctionRegistration extends FunctionNode {
  readonly serviceId?: string;
}
/**
 * HTTP trigger with its optional owning service.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: HttpTriggerRegistration): void => { console.log(value); };
 */
export type HttpTriggerRegistration = TriggerNode<"http", HttpTriggerConfig> & {
  readonly serviceId?: string;
};
/**
 * Task registration kept separate from legacy queues.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: TaskRegistration): void => { console.log(value); };
 */
export type TaskRegistration = TaskNode;
/**
 * Task-backed job registration.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: JobRegistration): void => { console.log(value); };
 */
export type JobRegistration = TaskJobNode;
/**
 * Legacy queue or queue trigger registration.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: QueueRegistration): void => { console.log(value); };
 */
export type QueueRegistration = LegacyJobNode | TriggerNode<"queue", JsonValue>;
/**
 * Schedule binding associated with a job.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: ScheduleRegistration): void => { console.log(value); };
 */
export interface ScheduleRegistration {
  readonly id: string;
  readonly source: SourceLocation;
  readonly jobId: string;
  readonly schedule: JsonValue;
}
/**
 * Exact event trigger registration.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: EventTriggerRegistration): void => { console.log(value); };
 */
export type EventTriggerRegistration = TriggerNode<"event", EventTriggerConfig>;
/**
 * Event contract projected for runtime registration.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: EventRegistration): void => { console.log(value); };
 */
export interface EventRegistration extends EventNode {}
/**
 * Bucket contract projected for runtime registration.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: BucketRegistration): void => { console.log(value); };
 */
export interface BucketRegistration extends BucketNode {}
/**
 * Cache contract projected for runtime registration.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: CacheRegistration): void => { console.log(value); };
 */
export interface CacheRegistration extends CacheNode {}
/**
 * Tool contract projected for runtime registration.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: ToolRegistration): void => { console.log(value); };
 */
export interface ToolRegistration extends ToolNode {}
/**
 * Agent contract projected for runtime registration.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: AgentRegistration): void => { console.log(value); };
 */
export interface AgentRegistration extends AgentNode {}
/**
 * Channel contract projected for runtime registration.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: ChannelRegistration): void => { console.log(value); };
 */
export interface ChannelRegistration extends ChannelNode {}
/**
 * Service contract projected for runtime registration.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: ServiceRegistration): void => { console.log(value); };
 */
export interface ServiceRegistration extends ServiceNode {}
/**
 * Middleware contract projected for runtime registration.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: MiddlewareRegistration): void => { console.log(value); };
 */
export interface MiddlewareRegistration extends MiddlewareNode {}

/**
 * Frozen, deterministically ordered runtime registration plan.
 * @remarks The planner emits this shape without acquiring runtime resources.
 * @example const inspect = (value: RegistrationPlan): void => { console.log(value); };
 */
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
