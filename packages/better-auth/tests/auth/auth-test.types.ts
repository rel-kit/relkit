import type { Auth } from "better-auth";
import type { Effect } from "effect";
import type { AuthFailure } from "../../src/auth.errors.js";

/** Controllable SDK boundary; defaults resolve immediately without production SDK work. */
export interface NativeAuthStubOptions {
  readonly handler?: (request: Request) => Promise<Response>;
  readonly session?: (...args: unknown[]) => Promise<unknown>;
  readonly context?: Promise<unknown>;
}

/** Deterministic factory outcome supplied to the same production factory contract. */
export type AuthFactoryOutcome = Effect.Effect<Auth<any>, AuthFailure>;
