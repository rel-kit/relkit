import type { DescriptorBase, DescriptorMetadata, Ref } from "@relkit/contracts";
import type { EventDescriptorAny } from "@relkit/events";
import type { FunctionRefAny } from "@relkit/functions";

export interface ServiceRef<Id extends string = string> {
  readonly ref: Ref<"service", Id>;
}

export type ServiceRefAny = ServiceRef;
export type ServiceFunctionMap = Readonly<Record<string, FunctionRefAny>>;
export type ServiceEventMap = Readonly<Record<string, EventDescriptorAny>>;

declare const serviceTypes: unique symbol;

type PublicMembers<Functions extends ServiceFunctionMap, Events extends ServiceEventMap> = Readonly<
  Functions & Events
>;

export type ServiceDescriptor<
  Id extends string,
  Functions extends ServiceFunctionMap = Readonly<Record<never, never>>,
  Events extends ServiceEventMap = Readonly<Record<never, never>>,
> = DescriptorBase<"service", Id> &
  PublicMembers<Functions, Events> & {
    readonly [serviceTypes]: {
      readonly functions: Functions;
      readonly events: Events;
    };
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

export interface DefineServiceOptions<
  Id extends string,
  Functions extends ServiceFunctionMap = Readonly<Record<never, never>>,
  Events extends ServiceEventMap = Readonly<Record<never, never>>,
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly functions?: Functions;
  readonly events?: Events;
}

export interface DefineService {
  <
    const Id extends string,
    const Functions extends ServiceFunctionMap = Readonly<Record<never, never>>,
    const Events extends ServiceEventMap = Readonly<Record<never, never>>,
  >(
    options: DefineServiceOptions<Id, Functions, Events>,
  ): ServiceDescriptor<Id, Functions, Events>;
}
