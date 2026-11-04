/** Builds the runtime handle: an application's typed clients for code outside function handlers. */
import { getDescriptorIdentity } from "../invocation/index.js";
import { serviceMemberEntries, type ServiceDescriptorAny } from "../services/index.js";
import { buildDependencyClients, type DependencyDeclarations } from "./dependencies.js";
import type { RelkitHandle, RuntimeHandleOptions } from "../functions/runtime-handle.types.js";
export type * from "../functions/runtime-handle.types.js";
export {
  ApplicationNotRunningError,
  getRelkit,
  runWithRelkit,
} from "../functions/runtime-handle.js";

/** Owner ID recorded on edges and spans of calls made through a handle. */
export const RUNTIME_HANDLE_OWNER = "relkit.handle";

/** Builds an application's handle from its services, descriptors and provider clients.
 * @param options - Services, invoker, descriptors, provider clients and databases.
 * @returns A frozen handle.
 * @example const handle = createRuntimeHandle({ services, invoke });
 */
export function createRuntimeHandle(options: RuntimeHandleOptions): RelkitHandle {
  const functions: Record<string, unknown> = {};
  const events: Record<string, unknown> = {};
  const tasks: Record<string, unknown> = {};
  const jobs: Record<string, unknown> = {};
  for (const [serviceId, service] of Object.entries(options.services)) {
    const members = memberDeclarations(service);
    functions[serviceId] = Object.freeze(
      Object.fromEntries(
        Object.entries(members.functions).map(([name, target]) => [
          name,
          (input: unknown) => options.invoke(getDescriptorIdentity(target as object), input),
        ]),
      ),
    );
    const clients = buildClients(options, {
      events: members.events,
      tasks: members.tasks,
      jobs: members.jobs,
    });
    events[serviceId] = clients.events;
    tasks[serviceId] = clients.tasks;
    jobs[serviceId] = clients.jobs;
  }
  const keyed = buildClients(options, {
    cache: options.descriptors?.cache ?? {},
    buckets: options.descriptors?.buckets ?? {},
    channels: options.descriptors?.channels ?? {},
    agents: options.descriptors?.agents ?? {},
  });
  return Object.freeze({
    functions: Object.freeze(functions),
    events: Object.freeze(events),
    tasks: Object.freeze(tasks),
    jobs: Object.freeze(jobs),
    database: options.database ?? Object.freeze({}),
    databases: Object.freeze({ ...options.databases }),
    cache: keyed.cache,
    buckets: keyed.buckets,
    channels: keyed.channels,
    agents: keyed.agents,
  }) as unknown as RelkitHandle;
}

/** Builds guarded clients for one set of declarations. */
function buildClients(options: RuntimeHandleOptions, dependencies: Record<string, unknown>) {
  return buildDependencyClients({
    ownerId: RUNTIME_HANDLE_OWNER,
    dependencies: dependencies as DependencyDeclarations,
    ...(options.sources === undefined ? {} : { sources: options.sources }),
    invokeFunction: (request) => options.invoke(request.functionId, request.input),
  });
}

/** Splits a service's public members by kind. */
function memberDeclarations(service: unknown) {
  const byKind: Record<"functions" | "events" | "tasks" | "jobs", Record<string, unknown>> = {
    functions: {},
    events: {},
    tasks: {},
    jobs: {},
  };
  const kinds: Readonly<Record<string, keyof typeof byKind>> = {
    function: "functions",
    event: "events",
    task: "tasks",
    job: "jobs",
  };
  for (const [name, member] of serviceMemberEntries(service as ServiceDescriptorAny)) {
    const kind = (member as { readonly ref?: { readonly kind?: string } } | undefined)?.ref?.kind;
    const target = kind === undefined ? undefined : kinds[kind];
    if (target === "functions" && (member as { invocationMode?: string }).invocationMode === "event-only")
      continue;
    if (target !== undefined) byKind[target][name] = member;
  }
  return byKind;
}
