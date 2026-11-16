import type { DescriptorBase, DescriptorMetadata, MaybePromise } from "../contracts/index.js";
import type { FunctionRefAny } from "../functions/index.js";
import type {
  HttpMethod,
  HttpRequestContentType,
  HttpRequestMapping,
  HttpResponseMapping,
} from "./http-dsl.js";
import type { RouteRateLimit } from "./route-options.js";
import type { RouteResponseFor } from "./route-response.types.js";
export type * from "./route-response.types.js";

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
  /** Stable route ID; derived from the method and path when omitted. */
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
  /** The function the route calls with the mapped request. */
  readonly target: Target;
  /** Not allowed with `target`: a route has a target function or a raw handler, not both. */
  readonly handler?: never;
  /** Media type of the request body; set `"multipart/form-data"` to receive file uploads. */
  readonly accept?: HttpRequestContentType;
  /** Explicit mapping from the request to the function's input; replaces the inferred one. */
  readonly request?: Request;
  /** The complete response contract; replaces the responses inferred from the function. */
  readonly responses?: readonly HttpResponseMapping[];
  /** Status of a successful response when the inferred one does not fit, such as `201`. */
  readonly successStatus?: number;
  /** Largest request body in bytes for this route; a larger one is answered `413`. */
  readonly maxBodyBytes?: number;
  /** Limits requests per key in a time window, before input mapping and the function call. */
  readonly rateLimit?: RouteRateLimit;
  /** Time limit of the function call in milliseconds for requests to this route. */
  readonly timeoutMs?: number;
  /** `false` hides the route from the generated client; `operation` sets query or mutation. */
  readonly client?: RouteClientPolicy;
  /** Sends a `streamOf` output in a native format: `"sse"`, `"text"` or `"bytes"`. */
  readonly stream?: { readonly format: NativeStreamFormat };
  /** Sets the success status, headers and cookies from the function's output. */
  readonly response?: RouteResponseFor<Target>;
  /** `"required"` rejects a request without a session with 401, before middleware and the target. */
  readonly auth?: "required";
}

/** Authoring options for a raw HTTP route.
 * @example const options: RawRouteOptions<"health"> = { handler: () => new Response("ok") };
 */
export interface RawRouteOptions<
  Id extends string,
  Handler extends RawHttpHandler = RawHttpHandler,
> extends RouteSharedOptions<Id> {
  /** Receives the raw `Request` and returns the `Response`; no function is called. */
  readonly handler: Handler;
  /** Not allowed with `handler`: a route has a raw handler or a target function, not both. */
  readonly target?: never;
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
  readonly response?: RouteResponseFor<Target>;
  readonly auth?: "required";
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
