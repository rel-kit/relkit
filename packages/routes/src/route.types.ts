import type { DescriptorBase, DescriptorMetadata, MaybePromise } from "@relkit/contracts";
import type { FunctionRefAny } from "@relkit/functions";
import type {
  HttpMethod,
  HttpRequestContentType,
  HttpRequestMapping,
  HttpResponseMapping,
} from "./http-dsl.js";
import type { RouteRateLimit } from "./route-options.js";

/** A raw HTTP handler receiving the incoming Request.
 * @example const handler: RawHttpHandler = () => new Response("ok");
 */
export type RawHttpHandler = (request: Request) => MaybePromise<Response>;
/** Client exposure and operation policy for a route.
 * @example const policy: RouteClientPolicy = { operation: "query" };
 */
export type RouteClientPolicy = false | { readonly operation?: "query" | "mutation" };
/** Native streaming transport formats.
 * @example const format: NativeStreamFormat = "sse";
 */
export type NativeStreamFormat = "sse" | "text" | "bytes";

interface RouteSharedOptions<Id extends string> extends DescriptorMetadata {
  readonly id?: Id;
}

/** Authoring options for a function-backed route.
 * @example type Options = FunctionRouteOptions<"orders.get", typeof getOrder>;
 */
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
  readonly client?: RouteClientPolicy;
  readonly stream?: { readonly format: NativeStreamFormat };
}

/** Authoring options for a raw HTTP route.
 * @example const options: RawRouteOptions<"health"> = { handler: () => new Response("ok") };
 */
export interface RawRouteOptions<
  Id extends string,
  Handler extends RawHttpHandler = RawHttpHandler,
> extends RouteSharedOptions<Id> {
  readonly handler: Handler;
  readonly target?: never;
  readonly auth?: {
    readonly protected?: readonly string[];
  };
}

/** Frozen descriptor for a function-backed route.
 * @example type Route = FunctionRouteDescriptor<"orders.get">;
 */
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
  readonly client?: RouteClientPolicy;
  readonly stream?: { readonly format: NativeStreamFormat };
}

/** Frozen descriptor for a raw HTTP route.
 * @example type Route = RawRouteDescriptor<"health">;
 */
export interface RawRouteDescriptor<
  Id extends string,
  Handler extends RawHttpHandler = RawHttpHandler,
> extends DescriptorBase<"route", Id> {
  readonly method?: HttpMethod;
  readonly path?: string;
  readonly runtimePaths?: readonly string[];
  readonly raw: true;
  readonly handler: Handler;
  readonly auth?: {
    readonly kind: "better-auth";
    readonly protected: readonly string[];
    readonly service: { readonly ref: { readonly kind: "service"; readonly id: string } };
  };
}

/** Union of function-backed and raw route descriptors.
 * @example type Route = RouteDescriptor<"orders.get">;
 */
export type RouteDescriptor<
  Id extends string,
  Target extends FunctionRefAny = FunctionRefAny,
  Request extends HttpRequestMapping | undefined = HttpRequestMapping | undefined,
> = FunctionRouteDescriptor<Id, Target, Request> | RawRouteDescriptor<Id>;
