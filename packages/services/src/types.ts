import type { DescriptorBase, DescriptorMetadata, MaybePromise, Ref } from "@zsys/contracts";
import type { FunctionContext, FunctionRefAny, FunctionRequest } from "@zsys/functions";

export interface ServiceRef<Id extends string = string> {
  readonly ref: Ref<"service", Id>;
}

export type ServiceRefAny = ServiceRef;

export interface ServiceMiddlewareRef<Id extends string = string> {
  readonly ref: {
    readonly kind: "service-middleware";
    readonly id: Id;
  };
}

export type ServiceMiddlewareRefAny = ServiceMiddlewareRef;

export type ServiceContextPatch = Readonly<Record<string, unknown>>;

export interface ServiceMiddlewareInvocation<
  Input = unknown,
  Context extends FunctionContext = FunctionContext,
> {
  readonly input: Input;
  readonly request: FunctionRequest | undefined;
  readonly context: Context;
}

export type ServiceMiddlewareNext<Patch extends ServiceContextPatch = ServiceContextPatch> = (
  patch?: Patch,
) => Promise<void>;

export type ServiceMiddlewareHandler<
  Input = unknown,
  Context extends FunctionContext = FunctionContext,
  Patch extends ServiceContextPatch = ServiceContextPatch,
> = (
  invocation: ServiceMiddlewareInvocation<Input, Context>,
  next: ServiceMiddlewareNext<Patch>,
) => MaybePromise<void>;

export interface ServiceMiddlewareDescriptor<
  Id extends string = string,
  Input = unknown,
  Context extends FunctionContext = FunctionContext,
  Patch extends ServiceContextPatch = ServiceContextPatch,
> extends ServiceMiddlewareRef<Id> {
  readonly kind: "service-middleware";
  readonly id: Id;
  readonly handler: ServiceMiddlewareHandler<Input, Context, Patch>;
}

export interface DefineServiceMiddlewareOptions<
  Id extends string,
  Input = unknown,
  Context extends FunctionContext = FunctionContext,
  Patch extends ServiceContextPatch = ServiceContextPatch,
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly handler: ServiceMiddlewareHandler<Input, Context, Patch>;
}

export interface DefineServiceMiddleware {
  <
    const Id extends string,
    Input = unknown,
    Context extends FunctionContext = FunctionContext,
    Patch extends ServiceContextPatch = ServiceContextPatch,
  >(
    options: DefineServiceMiddlewareOptions<Id, Input, Context, Patch>,
  ): ServiceMiddlewareDescriptor<Id, Input, Context, Patch>;
}

export type ServiceFunctionMap = Readonly<Record<string, FunctionRefAny>>;

export type NonEmptyServiceFunctionMap<Functions extends ServiceFunctionMap = ServiceFunctionMap> =
  keyof Functions extends never ? never : Functions;

export type ServiceMember<
  ServiceId extends string = string,
  Target extends FunctionRefAny = FunctionRefAny,
> = Target & {
  readonly service: ServiceRef<ServiceId>;
};

type ServiceMemberMap<ServiceId extends string, Functions extends ServiceFunctionMap> = {
  readonly [Name in keyof Functions]: Functions[Name] extends FunctionRefAny
    ? ServiceMember<ServiceId, Functions[Name]>
    : never;
};

export type ServiceDescriptor<
  Id extends string,
  Functions extends ServiceFunctionMap = Readonly<Record<never, never>>,
  Middleware extends readonly ServiceMiddlewareRefAny[] = readonly ServiceMiddlewareRefAny[],
> = DescriptorBase<"service", Id> &
  ServiceRef<Id> & {
    readonly functions: Functions;
    readonly middleware?: Middleware;
  } & ServiceMemberMap<Id, Functions>;

export type ServiceDescriptorAny = DescriptorBase<"service", string> &
  ServiceRefAny & {
    readonly functions: ServiceFunctionMap;
    readonly middleware?: readonly ServiceMiddlewareRefAny[];
  };

export interface DefineServiceOptions<
  Id extends string,
  Functions extends ServiceFunctionMap = ServiceFunctionMap,
  Middleware extends readonly ServiceMiddlewareRefAny[] = readonly ServiceMiddlewareRefAny[],
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly functions: NonEmptyServiceFunctionMap<Functions>;
  readonly middleware?: Middleware;
}

export interface DefineService {
  <
    const Id extends string,
    const Functions extends ServiceFunctionMap,
    const Middleware extends readonly ServiceMiddlewareRefAny[] =
      readonly ServiceMiddlewareRefAny[],
  >(
    options: DefineServiceOptions<Id, Functions, Middleware>,
  ): ServiceDescriptor<Id, Functions, Middleware>;
}
