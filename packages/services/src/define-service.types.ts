import type { DescriptorBase, DescriptorMetadata } from "@relkit/contracts";
import type { EventDescriptorAny } from "@relkit/events";
import type { FunctionRefAny } from "@relkit/functions";
import type { JobDescriptorAny, TaskDescriptorAny } from "@relkit/jobs";

/** Named function members on a service.
 * @example type Functions = ServiceFunctionMap;
 */
export type ServiceFunctionMap = Readonly<Record<string, FunctionRefAny>>;
/** Named event members on a service.
 * @example type Events = ServiceEventMap;
 */
export type ServiceEventMap = Readonly<Record<string, EventDescriptorAny>>;
/** Named task members on a service.
 * @example type Tasks = ServiceTaskMap;
 */
export type ServiceTaskMap = Readonly<Record<string, TaskDescriptorAny>>;
/** Named job members on a service.
 * @example type Jobs = ServiceJobMap;
 */
export type ServiceJobMap = Readonly<Record<string, JobDescriptorAny>>;

declare const serviceTypes: unique symbol;

type PublicMembers<
  Functions extends ServiceFunctionMap,
  Events extends ServiceEventMap,
  Tasks extends ServiceTaskMap,
  Jobs extends ServiceJobMap,
> = Readonly<Functions & Events & Tasks & Jobs>;

type ServiceTypeMembers<
  Functions extends ServiceFunctionMap,
  Events extends ServiceEventMap,
  Tasks extends ServiceTaskMap,
  Jobs extends ServiceJobMap,
> = {
  readonly functions: Functions;
  readonly events: Events;
  readonly tasks: Tasks;
  readonly jobs: Jobs;
};

/** Frozen service descriptor with identity-preserving public members.
 * @example type Orders = ServiceDescriptor<"orders", { lookup: typeof lookup }>;
 */
export type ServiceDescriptor<
  Id extends string,
  Functions extends ServiceFunctionMap = Readonly<Record<never, never>>,
  Events extends ServiceEventMap = Readonly<Record<never, never>>,
  Tasks extends ServiceTaskMap = Readonly<Record<never, never>>,
  Jobs extends ServiceJobMap = Readonly<Record<never, never>>,
> = DescriptorBase<"service", Id> &
  PublicMembers<Functions, Events, Tasks, Jobs> & {
    readonly [serviceTypes]: ServiceTypeMembers<Functions, Events, Tasks, Jobs>;
  };

/** Service descriptor with an unspecified ID and member set.
 * @example function inspect(service: ServiceDescriptorAny) { return service.id; }
 */
export type ServiceDescriptorAny = DescriptorBase<"service", string>;

/** Extracts the function members recorded in a service type.
 * @example type Functions = ServiceFunctions<typeof orders>;
 */
export type ServiceFunctions<Service> = Service extends {
  readonly [serviceTypes]: { readonly functions: infer Functions };
}
  ? Functions
  : never;

/** Extracts the event members recorded in a service type.
 * @example type Events = ServiceEvents<typeof orders>;
 */
export type ServiceEvents<Service> = Service extends {
  readonly [serviceTypes]: { readonly events: infer Events };
}
  ? Events
  : never;

/** Extracts the task members recorded in a service type.
 * @example type Tasks = ServiceTasks<typeof orders>;
 */
export type ServiceTasks<Service> = Service extends {
  readonly [serviceTypes]: { readonly tasks: infer Tasks };
}
  ? Tasks
  : never;

/** Extracts the job members recorded in a service type.
 * @example type Jobs = ServiceJobs<typeof orders>;
 */
export type ServiceJobs<Service> = Service extends {
  readonly [serviceTypes]: { readonly jobs: infer Jobs };
}
  ? Jobs
  : never;

/** Metadata and optional descriptor members accepted by defineService.
 * @example const options: DefineServiceOptions<"orders"> = { id: "orders" };
 */
export interface DefineServiceOptions<
  Id extends string,
  Functions extends ServiceFunctionMap = Readonly<Record<never, never>>,
  Events extends ServiceEventMap = Readonly<Record<never, never>>,
  Tasks extends ServiceTaskMap = Readonly<Record<never, never>>,
  Jobs extends ServiceJobMap = Readonly<Record<never, never>>,
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly functions?: Functions;
  readonly events?: Events;
  readonly tasks?: Tasks;
  readonly jobs?: Jobs;
}

/** Generic synchronous service factory preserving member inference.
 * @param options - Service metadata and named members.
 * @returns A frozen identity-preserving descriptor.
 * @throws TypeError for malformed local input, or the original identity/ID error.
 * @example const orders = defineService({ id: "orders", functions: { lookup } });
 */
export interface DefineService {
  <
    const Id extends string,
    const Functions extends ServiceFunctionMap = Readonly<Record<never, never>>,
    const Events extends ServiceEventMap = Readonly<Record<never, never>>,
    const Tasks extends ServiceTaskMap = Readonly<Record<never, never>>,
    const Jobs extends ServiceJobMap = Readonly<Record<never, never>>,
  >(
    options: DefineServiceOptions<Id, Functions, Events, Tasks, Jobs>,
  ): ServiceDescriptor<Id, Functions, Events, Tasks, Jobs>;
}
