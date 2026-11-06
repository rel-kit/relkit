/** Inputs of the shared events provider conformance suite. */
import type { EventProvider } from "relkit/events";
import type { ConformanceCase } from "./conformance.types.js";

/** The envelope a consumer receives; every provider's trigger envelope has at least these. */
export interface EventsConformanceEnvelope {
  readonly instanceId: string;
  readonly payload: unknown;
}

/**
 * A durable consumer, in the shape the local and Postgres event providers register through
 * `registerTrigger`.
 */
export interface EventsConformanceTrigger {
  readonly id: string;
  readonly eventId: string;
  readonly eventVersion: number;
  readonly delivery: "durable";
  readonly retry: {
    readonly maxAttempts: number;
    readonly initialDelayMs: number;
    readonly maxDelayMs: number;
    readonly multiplier: number;
    readonly jitter: "none";
  };
  readonly invoke: (envelope: EventsConformanceEnvelope) => Promise<unknown>;
}

/** An event provider under test. Delivery cases need `registerTrigger`. */
export type EventsConformanceProvider = EventProvider & {
  readonly registerTrigger?: (trigger: EventsConformanceTrigger) => Promise<unknown>;
  readonly close?: () => Promise<unknown>;
};

/** What an event provider supplies to run the suite. */
export interface EventsConformanceOptions {
  /**
   * Creates a provider for one case, already set up for `event`: a provider that validates
   * against registered contracts registers it here.
   * @param namespace - Unique profile or namespace for the case.
   * @param event - The event the cases publish.
   */
  readonly create: (
    namespace: string,
    event: { readonly id: string; readonly version: number },
  ) => EventsConformanceProvider | Promise<EventsConformanceProvider>;
  /**
   * Moves due deliveries forward, for providers that deliver on a poll the test drives (such as
   * Postgres with `consumers: false`). Background delivery needs nothing here.
   */
  readonly deliver?: (provider: EventsConformanceProvider) => Promise<unknown>;
  /**
   * The failure a consumer throws to ask for a retry. By default an `applicationFailure` with
   * `retry: "later"`; a plain `Error` is a permanent failure that is dead-lettered.
   */
  readonly retryableFailure?: () => unknown;
  /** Time limit for a delivery, 10 000 ms by default. */
  readonly deliveryTimeoutMs?: number;
  /** Failure injection: a provider whose backend cannot answer. */
  readonly failing?: () => EventsConformanceProvider | Promise<EventsConformanceProvider>;
}

/** Case ids of the events suite. */
export type EventsConformanceCaseId =
  | "publish-accepted"
  | "distinct-instances"
  | "delivery"
  | "retry-after-failure"
  | "backend-failure";

/** One events conformance case. */
export type EventsConformanceCase = ConformanceCase<EventsConformanceCaseId>;
