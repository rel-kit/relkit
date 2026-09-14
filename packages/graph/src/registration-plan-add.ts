import type { JsonValue } from "@relkit/contracts";
import type { GraphNode, LegacyJobNode, TriggerNode } from "./model.js";
import type {
  EventTriggerRegistration,
  HttpTriggerRegistration,
  RegistrationPlan,
} from "./registration-plan.js";

export type MutableRegistrationPlan = {
  -readonly [Key in keyof RegistrationPlan]-?: NonNullable<
    RegistrationPlan[Key]
  > extends readonly (infer Item)[]
    ? Item[]
    : NonNullable<RegistrationPlan[Key]>;
};

export function addNode(
  plan: MutableRegistrationPlan,
  node: GraphNode,
  serviceIds: ReadonlyMap<string, string>,
): void {
  switch (node.kind) {
    case "function": {
      const serviceId = serviceIds.get(node.id);
      plan.functions.push(serviceId === undefined ? node : { ...node, serviceId });
      return;
    }
    case "trigger":
      addTrigger(plan, node, serviceIds);
      return;
    case "job":
      if (node.executionModel === "task") plan.jobs.push(node);
      else {
        plan.queues.push(node);
        addSchedules(plan.schedules, node);
      }
      return;
    case "task":
      plan.tasks.push(node);
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
    case "channel":
      plan.channels.push(node);
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
  plan: MutableRegistrationPlan,
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

function addSchedules(output: MutableRegistrationPlan["schedules"], node: LegacyJobNode): void {
  if (!Array.isArray(node.schedule)) return;
  node.schedule.forEach((schedule, index) => {
    const id = isRecord(schedule) && typeof schedule.id === "string" ? schedule.id : String(index);
    output.push({ id: `${node.id}:${id}`, source: node.source, jobId: node.id, schedule });
  });
}

function scheduleFromTrigger(node: TriggerNode): MutableRegistrationPlan["schedules"][number] {
  const config = isRecord(node.config) ? node.config : {};
  const schedule = config.schedule ?? node.config;
  const jobId = typeof config.jobId === "string" ? config.jobId : node.targetFunctionId;
  return { id: node.id, source: node.source, jobId, schedule };
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
