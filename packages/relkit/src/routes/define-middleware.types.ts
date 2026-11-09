import type { Context, Next } from "hono";
import type { DescriptorBase, MaybePromise } from "../contracts/index.js";
import type { PublicClock, PublicLogger, PublicTrace } from "../invocation/index.js";
import type { AuthContext, ResolvedApplicationEnv } from "../functions/index.js";
import type { InferInput, InferOutput, StandardSchemaV1 } from "../schema/index.js";

/** Invocation-scoped capabilities provided to middleware.
 * @example const context: MiddlewareContext = relkit;
 */
export interface MiddlewareContext<Provided = never> {
  /** Validates data against the middleware's `provides` schema and makes it available to
   * routes through `http.from(middleware, field)`.
   * @param data - Data for this request.
   * @returns After validation; invalid data fails the request with a 500.
   * @example await relkit.provide({ tenantId: "acme" });
   */
  readonly provide: (data: Provided) => Promise<void>;
  readonly signal: AbortSignal;
  readonly env: ResolvedApplicationEnv;
  readonly auth: AuthContext;
  readonly log: PublicLogger;
  readonly time: PublicClock;
  readonly trace: PublicTrace;
}

/** Request-scoped services a host supplies to middleware; RelKit adds `provide`.
 * @example const services: MiddlewareServices = { signal, env, auth, log, time, trace };
 */
export type MiddlewareServices = Omit<MiddlewareContext<never>, "provide">;

/** A path-scoped HTTP middleware callback.
 * @example const handler: MiddlewareHandler = async (_context, next) => next();
 */
export type MiddlewareHandler<Provided = never> = (
  context: Context,
  next: Next,
  relkit: MiddlewareContext<Provided>,
) => MaybePromise<Response | void>;

/** Typed middleware: a schema for the data it provides and its handler.
 * @example const options: TypedMiddlewareOptions<typeof tenant> = { provides: tenant, handler };
 */
export interface TypedMiddlewareOptions<Schema extends StandardSchemaV1> {
  readonly provides: Schema;
  readonly handler: MiddlewareHandler<InferInput<Schema>>;
}

/** Frozen descriptor for one middleware handler.
 * @example const descriptor: MiddlewareDescriptor = defineMiddleware("/orders", handler);
 */
export interface MiddlewareDescriptor<
  Id extends string = string,
  Provided = never,
> extends DescriptorBase<"middleware", Id> {
  readonly path: string;
  readonly handler: MiddlewareHandler<any>;
  /** Schema of the data the middleware provides to `http.from`. */
  readonly provides?: StandardSchemaV1;
  /** Phantom type of the provided data, read by `http.from`. */
  readonly __provides?: Provided;
}

/** Provided data type of a schema, for typed middleware descriptors. */
export type ProvidedData<Schema extends StandardSchemaV1> = InferOutput<Schema>;
