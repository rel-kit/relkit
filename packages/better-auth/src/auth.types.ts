import type { createDescriptorBase } from "@relkit/contracts";
import type {
  DrizzleActivation,
  DrizzleServiceDescriptor,
  DrizzleFailure,
} from "@relkit/drizzle/internal";
import type { RawHttpHandler } from "@relkit/routes";
import type { Auth, BetterAuthOptions } from "better-auth";
import type { DrizzleAdapterConfig } from "better-auth/adapters/drizzle";
import type { Effect, ManagedRuntime } from "effect";
import type { AuthFailure } from "./auth.errors.js";
import type { AuthService } from "./auth.service.js";
import { BETTER_AUTH_HANDLER } from "./symbols.js";

/** Native options; RELKIT supplies database and the route-derived base path. */
export type BetterAuthServiceOptions = Omit<BetterAuthOptions, "database" | "basePath"> & {
  readonly database?: never;
  readonly basePath?: never;
  readonly drizzle?: Omit<DrizzleAdapterConfig, "provider">;
};

/** Frozen handler registration used by route discovery without acquisition. */
export interface BetterAuthRegistration {
  readonly kind: "better-auth";
  readonly service: BetterAuthServiceDescriptor<any>;
}

/**
 * Route handler carrying native session inference without a live SDK object.
 * @typeParam Session - Native session and user result inferred from auth options.
 */
export type BetterAuthHandler<Session = unknown> = RawHttpHandler & {
  readonly [BETTER_AUTH_HANDLER]: BetterAuthRegistration;
  readonly __session?: Session;
};

/**
 * Extracts native session and user types from an authored auth handler.
 * @typeParam Handler - Branded handler whose phantom session inference is read.
 */
export type InferBetterAuthSession<Handler> =
  Handler extends BetterAuthHandler<infer Session> ? Session : never;

/**
 * Lazy declaration whose handler identity survives activation and isolation.
 * @typeParam Options - Native auth configuration retaining plugin/session inference.
 */
export interface BetterAuthServiceDescriptor<
  Options extends BetterAuthServiceOptions,
> extends ReturnType<typeof createDescriptorBase<"service", string>> {
  readonly capability: { readonly kind: "better-auth" };
  readonly handler: BetterAuthHandler<Auth<Options>["$Infer"]["Session"]>;
}

/** Borrowed database; its Drizzle owner remains solely responsible for disposal. */
export type AuthDatabase = DrizzleActivation<DrizzleServiceDescriptor<any, any, any, any>>;

/** Runtime dependencies captured once when constructing a native auth service. */
export interface AuthConfiguration {
  readonly options: BetterAuthServiceOptions;
  readonly database: AuthDatabase;
  readonly basePath: string;
}

/** Replaceable SDK construction contract; expected SDK failures retain their cause. */
export interface AuthFactoryInterface {
  /**
   * Constructs native auth during service acquisition.
   * @param options - Native options including the owner-supplied database adapter.
   * @returns Lazy factory effect retaining expected SDK failures as AuthFailure.
   */
  readonly create: (options: BetterAuthOptions) => Effect.Effect<Auth<any>, AuthFailure>;
}

/** Effect-native operations sharing one native SDK instance and database admission. */
export interface AuthServiceInterface {
  /**
   * Executes native routing while holding borrowed database admission.
   * @param request - Unmodified native Request, including its cancellation signal.
   * @returns Lazy response effect; SDK failures retain their original cause.
   */
  readonly handler: (request: Request) => Effect.Effect<Response, AuthFailure | DrizzleFailure>;

  /**
   * Executes a native endpoint with its original arguments and callable metadata.
   * @param method - Native API property; diagnostics normalize it to bounded labels.
   * @param args - Native arguments passed without inspecting sensitive payloads.
   * @returns Lazy opaque native result, with admission and SDK typed failures.
   */
  readonly api: (
    method: string,
    args: readonly unknown[],
  ) => Effect.Effect<unknown, AuthFailure | DrizzleFailure>;
}

/**
 * Server-only declaration state: the managed owner, rather than a mutable Promise.
 * @typeParam Options - Options retained by the original authoring declaration.
 */
export interface BetterAuthRuntime<Options extends BetterAuthServiceOptions> {
  readonly options: Options;
  activation: ManagedRuntime.ManagedRuntime<AuthService, AuthFailure | DrizzleFailure> | undefined;
}
