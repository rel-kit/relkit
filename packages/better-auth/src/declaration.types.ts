/** Lazy authentication declarations independent of a database adapter or browser. */
import type { createDescriptorBase } from "relkit/contracts";
import type { RawHttpHandler } from "relkit/routes";
import type { Auth, BetterAuthOptions } from "better-auth";
import type { BetterAuthAccess, BetterAuthAccessOf } from "./access.types.js";
import { BETTER_AUTH_HANDLER } from "./symbols.js";

/** Native options; activation supplies the database and route-derived base path. */
export type BetterAuthServiceOptions = Omit<BetterAuthOptions, "database" | "basePath"> & {
  readonly database?: never;
  readonly basePath?: never;
};

/** The application's own Better Auth instance, from `betterAuth({...})` in a Better Auth file. */
export interface BetterAuthInstance {
  readonly options: BetterAuthOptions;
  readonly handler: (request: Request) => Promise<Response>;
  readonly $Infer: { readonly Session: unknown };
}

/** Options for a service built from the application's Better Auth instance. */
export interface BetterAuthInstanceServiceOptions<Instance extends BetterAuthInstance> {
  /** The Better Auth instance; RelKit rebuilds it from `auth.options` when the server starts. */
  readonly auth: Instance;
  /** `false` keeps RelKit from mounting the handler at the instance's `basePath`. */
  readonly mount?: false;
}

/** Frozen registration used by route discovery without acquiring native auth. */
export interface BetterAuthRegistration {
  readonly kind: "better-auth";
  readonly service: BetterAuthServiceDescriptor<any>;
}

/** Native route handler retaining the session type and the access control's names. */
export type BetterAuthHandler<Session = unknown, Access = BetterAuthAccess> = RawHttpHandler & {
  readonly [BETTER_AUTH_HANDLER]: BetterAuthRegistration;
  readonly __session?: Session;
  readonly __access?: Access;
};

/** Projects the session inferred by a lazy authentication handler. */
export type InferBetterAuthSession<Handler> =
  Handler extends BetterAuthHandler<infer Session, unknown> ? Session : never;

/** Projects the role and permission names of a handler's access control; the generated context
 * registry uses it to type function access rules.
 * @example interface ApplicationAccess extends InferBetterAuthAccess<typeof service.handler> {}
 */
export type InferBetterAuthAccess<Handler> = Handler extends {
  readonly __access?: infer Access extends BetterAuthAccess;
}
  ? Access
  : BetterAuthAccess;

/** Lazy authoring declaration whose identity survives isolated activation. */
export interface BetterAuthServiceDescriptor<
  Options extends BetterAuthServiceOptions,
  Session = Auth<Options>["$Infer"]["Session"],
  Access = BetterAuthAccessOf<Options>,
> extends ReturnType<typeof createDescriptorBase<"service", string>> {
  readonly capability: {
    readonly kind: "better-auth";
    /** Where the handler is mounted when no route mounts it. */
    readonly basePath?: string;
    /** `false` when the application mounts the handler itself, or not at all. */
    readonly mount?: boolean;
    /** `custom` when the instance brings its own database instead of the Drizzle service. */
    readonly database?: "drizzle" | "custom";
  };
  readonly handler: BetterAuthHandler<Session, Access>;
}

/** Database-independent state populated by the explicitly selected server bridge. */
export interface BetterAuthDeclarationRuntime<Options extends BetterAuthServiceOptions> {
  /** Native options; an instance's options may carry their own `database` and `basePath`. */
  readonly options: Options | BetterAuthOptions;
  activation: object | undefined;
  handle: ((request: Request) => Promise<Response>) | undefined;
}
