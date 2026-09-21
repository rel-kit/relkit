import type { Auth, BetterAuthOptions } from "better-auth";
import type { DrizzleAdapterConfig } from "better-auth/adapters/drizzle";
import type { createDescriptorBase } from "@relkit/contracts";
import type { RawHttpHandler } from "@relkit/routes";
import { BETTER_AUTH_HANDLER } from "./runtime.js";

export type BetterAuthServiceOptions = Omit<BetterAuthOptions, "database" | "basePath"> & {
  readonly database?: never;
  readonly basePath?: never;
  readonly drizzle?: Omit<DrizzleAdapterConfig, "provider">;
};

export interface BetterAuthRegistration {
  readonly kind: "better-auth";
  readonly service: BetterAuthServiceDescriptor<any>;
}

export type BetterAuthHandler<Session = unknown> = RawHttpHandler & {
  readonly [BETTER_AUTH_HANDLER]: BetterAuthRegistration;
  readonly __session?: Session;
};

export type InferBetterAuthSession<Handler> =
  Handler extends BetterAuthHandler<infer Session> ? Session : never;

export interface BetterAuthServiceDescriptor<
  Options extends BetterAuthServiceOptions,
> extends ReturnType<typeof createDescriptorBase<"service", string>> {
  readonly capability: { readonly kind: "better-auth" };
  readonly handler: BetterAuthHandler<Auth<Options>["$Infer"]["Session"]>;
}
