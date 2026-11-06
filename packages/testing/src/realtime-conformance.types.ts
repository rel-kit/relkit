/** Inputs of the shared realtime provider conformance suite. */
import type { RealtimeProvider } from "relkit/realtime";
import type { ConformanceCase } from "./conformance.types.js";

/** A realtime provider under test, with the optional lifecycle methods first-party ones have. */
export type RealtimeConformanceProvider = RealtimeProvider & {
  readonly ready?: () => Promise<unknown>;
  readonly close?: () => Promise<unknown>;
};

/** What a realtime provider supplies to run the suite. */
export interface RealtimeConformanceOptions {
  /**
   * Creates a provider on the shared backend. Each case calls it twice with the same profile and
   * expects both instances to see each other's events, as two server processes would.
   * @param profile - Unique profile for the case.
   */
  readonly create: (profile: string) => RealtimeConformanceProvider;
  /**
   * Failure injection: creates a provider whose backend cannot answer. The `backend-failure` case
   * is skipped without it.
   */
  readonly failing?: () => RealtimeConformanceProvider;
}

/** Case ids of the realtime suite. */
export type RealtimeConformanceCaseId =
  | "wake-on-append"
  | "read-after-checkpoint"
  | "concurrent-appends"
  | "idempotent-append"
  | "wait-deadline"
  | "presence"
  | "backend-failure";

/** One realtime conformance case. */
export type RealtimeConformanceCase = ConformanceCase<RealtimeConformanceCaseId>;
