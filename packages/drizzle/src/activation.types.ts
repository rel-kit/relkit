import type { Context } from "effect";
import type { DatabaseContext, DrizzleServiceDescriptor } from "./types.js";

/** Acquisition policy for an application that owns its database lifetime. */
export interface DrizzleActivationOptions {
  /** Bypasses descriptor sharing; the caller must close this activation. */
  readonly isolated?: boolean;
  /** Configured observation services captured by the compatibility owner. */
  readonly instrumentation?: Context.Context<never>;
}

/**
 * Frozen public activation; resource ownership ends at close.
 * @typeParam Service - Authored descriptor preserving native client/model inference.
 */
export interface DrizzleActivation<Service extends DrizzleServiceDescriptor<any, any, any, any>> {
  /** Native escape hatch; callers must use admitted APIs to guarantee orderly close. */
  readonly client: Service extends DrizzleServiceDescriptor<any, infer Client, any, any>
    ? Client
    : never;
  readonly context: DatabaseContext<Service>;
  /**
   * Stops admission and releases the owner after admitted native work settles.
   * @returns Shared close Promise; later calls observe the same completion.
   */
  readonly close: () => Promise<void>;
}
