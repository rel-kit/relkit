import type { DescriptorBase, DescriptorMetadata, MaybePromise } from "@zsys/contracts";
import type { FunctionRefAny } from "@zsys/functions";
import type {
  HttpMethod,
  HttpRequestContentType,
  HttpRequestMapping,
  HttpResponseMapping,
} from "./http-dsl.js";
import type { RouteRateLimit } from "./route-options.js";

export type RawHttpHandler = (request: Request) => MaybePromise<Response>;

interface RouteSharedOptions<Id extends string> extends DescriptorMetadata {
  readonly id?: Id;
}

export interface FunctionRouteOptions<
  Id extends string,
  Target extends FunctionRefAny,
  Request extends HttpRequestMapping | undefined = undefined,
> extends RouteSharedOptions<Id> {
  readonly target: Target;
  readonly handler?: never;
  readonly accept?: HttpRequestContentType;
  readonly request?: Request;
  readonly responses?: readonly HttpResponseMapping[];
  readonly successStatus?: number;
  readonly maxBodyBytes?: number;
  readonly rateLimit?: RouteRateLimit;
  readonly timeoutMs?: number;
}

export interface RawRouteOptions<
  Id extends string,
  Handler extends RawHttpHandler = RawHttpHandler,
> extends RouteSharedOptions<Id> {
  readonly handler: Handler;
  readonly target?: never;
}

export interface FunctionRouteDescriptor<
  Id extends string,
  Target extends FunctionRefAny = FunctionRefAny,
  Request extends HttpRequestMapping | undefined = HttpRequestMapping | undefined,
> extends DescriptorBase<"route", Id> {
  readonly method?: HttpMethod;
  readonly path?: string;
  readonly runtimePaths?: readonly string[];
  readonly target: Target;
  readonly accept?: HttpRequestContentType;
  readonly request?: Request;
  readonly responses?: readonly HttpResponseMapping[];
  readonly successStatus?: number;
  readonly maxBodyBytes?: number;
  readonly rateLimit?: RouteRateLimit;
  readonly timeoutMs?: number;
}

export interface RawRouteDescriptor<
  Id extends string,
  Handler extends RawHttpHandler = RawHttpHandler,
> extends DescriptorBase<"route", Id> {
  readonly method?: "ALL";
  readonly path?: string;
  readonly runtimePaths?: readonly string[];
  readonly raw: true;
  readonly handler: Handler;
  readonly auth?: {
    readonly kind: "better-auth";
    readonly protected: readonly string[];
  };
}

export type RouteDescriptor<
  Id extends string,
  Target extends FunctionRefAny = FunctionRefAny,
  Request extends HttpRequestMapping | undefined = HttpRequestMapping | undefined,
> = FunctionRouteDescriptor<Id, Target, Request> | RawRouteDescriptor<Id>;
