/** Lazy authentication declarations independent of a database adapter or browser. */
import type { createDescriptorBase } from "@relkit/contracts";
import type { RawHttpHandler } from "@relkit/routes";
import type { Auth, BetterAuthOptions } from "better-auth";
import { BETTER_AUTH_HANDLER } from "./symbols.js";

/** Native options; activation supplies the database and route-derived base path. */
export type BetterAuthServiceOptions = Omit<BetterAuthOptions, "database" | "basePath"> & {
  readonly database?: never;
  readonly basePath?: never;
};

/** Frozen registration used by route discovery without acquiring native auth. */
export interface BetterAuthRegistration {
  readonly kind: "better-auth";
  readonly service: BetterAuthServiceDescriptor<any>;
}

/** Native route handler retaining inferred session and user types. */
export type BetterAuthHandler<Session = unknown> = RawHttpHandler & {
  readonly [BETTER_AUTH_HANDLER]: BetterAuthRegistration;
  readonly __session?: Session;
};

/** Projects the session inferred by a lazy authentication handler. */
export type InferBetterAuthSession<Handler> =
  Handler extends BetterAuthHandler<infer Session> ? Session : never;

/** Lazy authoring declaration whose identity survives isolated activation. */
export interface BetterAuthServiceDescriptor<
  Options extends BetterAuthServiceOptions,
> extends ReturnType<typeof createDescriptorBase<"service", string>> {
  readonly capability: { readonly kind: "better-auth" };
  readonly handler: BetterAuthHandler<Auth<Options>["$Infer"]["Session"]>;
}

/** Database-independent state populated by the explicitly selected server bridge. */
export interface BetterAuthDeclarationRuntime<Options extends BetterAuthServiceOptions> {
  readonly options: Options;
  activation: object | undefined;
  handle: ((request: Request) => Promise<Response>) | undefined;
}
