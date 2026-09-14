import { createDescriptorBase, deepFreeze } from "@relkit/contracts";
import { assertEventDescriptor } from "@relkit/events";
import type { FunctionRefAny } from "@relkit/functions";
import { isJobDescriptor, isTaskDescriptor } from "@relkit/jobs";
import { bindDescriptorServiceMembers, createUnboundIdentity } from "@relkit/invocation";
import {
  assertServiceDescriptor,
  assertServiceMemberName,
  isFunctionDescriptor,
} from "./guards.js";
import type {
  DefineService,
  DefineServiceOptions,
  ServiceDescriptor,
  ServiceEventMap,
  ServiceFunctionMap,
  ServiceJobMap,
  ServiceTaskMap,
} from "./types.js";

/**
 * Defines a domain's public functions and events as identity-preserving members.
 *
 * @example
 * ```ts
 * import { defineService } from "@relkit/app/services"
 *
 * const orders = defineService({})
 * void orders
 * ```
 * @category Services
 * @since 0.1.0
 */
export const defineService: DefineService = <
  const Id extends string,
  const Functions extends ServiceFunctionMap = Readonly<Record<never, never>>,
  const Events extends ServiceEventMap = Readonly<Record<never, never>>,
  const Tasks extends ServiceTaskMap = Readonly<Record<never, never>>,
  const Jobs extends ServiceJobMap = Readonly<Record<never, never>>,
>(
  options: DefineServiceOptions<Id, Functions, Events, Tasks, Jobs>,
): ServiceDescriptor<Id, Functions, Events, Tasks, Jobs> => {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Service options must be an object");
  }
  const functions = copyMembers(options.functions, isFunctionDescriptor, "function");
  const events = copyMembers(options.events, isEvent, "event");
  const tasks = copyMembers(options.tasks, isTaskDescriptor, "task");
  const jobs = copyMembers(options.jobs, isJobDescriptor, "job");
  assertUniqueMembers(functions, events, tasks, jobs);
  const id = (options.id === undefined ? createUnboundIdentity() : options.id) as Id;
  const descriptor = {
    ...createDescriptorBase("service", id, options),
    ...functions,
    ...events,
    ...tasks,
    ...jobs,
  };
  assertServiceDescriptor(descriptor);
  bindDescriptorServiceMembers(
    [...Object.values(functions), ...Object.values(events), ...Object.values(tasks), ...Object.values(jobs)],
    descriptor,
  );
  return deepFreeze(descriptor) as ServiceDescriptor<Id, Functions, Events, Tasks, Jobs>;
};

function copyMembers<T>(
  value: Readonly<Record<string, T>> | undefined,
  validate: (value: unknown) => value is T,
  kind: "function" | "event" | "task" | "job",
): Readonly<Record<string, T>> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new TypeError(`Service ${kind}s must be an object`);
  const members: Record<string, T> = {};
  for (const [name, member] of Object.entries(value)) {
    assertServiceMemberName(name);
    if (!validate(member)) throw new TypeError(`Invalid service ${kind} member "${name}"`);
    if (name in members) throw new TypeError(`Duplicate service member "${name}"`);
    members[name] = member;
  }
  return members;
}

function assertUniqueMembers(
  ...maps: readonly Readonly<Record<string, unknown>>[]
): void {
  const names = new Set<string>();
  for (const members of maps) {
    for (const name of Object.keys(members)) {
      if (names.has(name)) throw new TypeError(`Duplicate service member "${name}"`);
      names.add(name);
    }
  }
}

function isEvent(value: unknown): value is ServiceEventMap[string] {
  try {
    assertEventDescriptor(value);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
