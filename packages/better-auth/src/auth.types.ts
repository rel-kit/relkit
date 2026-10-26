/** Describes the selected Drizzle authentication bridge using actual native SDK contracts.
 * Portable lazy declarations remain in declaration.types so backend root consumers avoid this adapter closure.
 */
import type {
  DrizzleActivation,
  DrizzleServiceDescriptor,
  DrizzleFailure,
} from "@relkit/drizzle/internal";
import type { Auth, BetterAuthOptions } from "better-auth";
import type { DrizzleAdapterConfig } from "better-auth/adapters/drizzle";
import type { Effect, ManagedRuntime } from "effect";
import type { AuthFailure } from "./auth.errors.js";
import type { AuthService } from "./auth.service.js";
import type { BetterAuthServiceOptions as DeclarationOptions } from "./declaration.types.js";
export type {
  BetterAuthHandler,
  BetterAuthRegistration,
  BetterAuthServiceDescriptor,
  InferBetterAuthSession,
} from "./declaration.types.js";

/** Native options; RELKIT supplies database and the route-derived base path. */
export type BetterAuthServiceOptions = DeclarationOptions & {
  readonly drizzle?: Omit<DrizzleAdapterConfig, "provider">;
};

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
  handle: ((request: Request) => Promise<Response>) | undefined;
}
