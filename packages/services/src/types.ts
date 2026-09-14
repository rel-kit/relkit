import type { DescriptorBase, DescriptorMetadata, Ref } from "@relkit/contracts";
import type { EventDescriptorAny } from "@relkit/events";
import type { FunctionRefAny } from "@relkit/functions";
import type { JobDescriptorAny, TaskDescriptorAny } from "@relkit/jobs";

export interface ServiceRef<Id extends string = string> {
  readonly ref: Ref<"service", Id>;
}

export type ServiceRefAny = ServiceRef;
export type ServiceFunctionMap = Readonly<Record<string, FunctionRefAny>>;
export type ServiceEventMap = Readonly<Record<string, EventDescriptorAny>>;
export type ServiceTaskMap = Readonly<Record<string, TaskDescriptorAny>>;
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

export type ServiceDescriptorAny = DescriptorBase<"service", string>;

export type ServiceFunctions<Service> = Service extends {
  readonly [serviceTypes]: { readonly functions: infer Functions };
}
  ? Functions
  : never;

export type ServiceEvents<Service> = Service extends {
  readonly [serviceTypes]: { readonly events: infer Events };
}
  ? Events
  : never;

export type ServiceTasks<Service> = Service extends {
  readonly [serviceTypes]: { readonly tasks: infer Tasks };
}
  ? Tasks
  : never;

export type ServiceJobs<Service> = Service extends {
  readonly [serviceTypes]: { readonly jobs: infer Jobs };
}
  ? Jobs
  : never;

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
