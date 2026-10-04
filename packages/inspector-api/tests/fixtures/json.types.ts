import type { ObservabilityQuery } from "@relkit/observability";
import type { InspectorJobsBinding } from "../../src/jobs/types.js";

/** Response projections whose fields are checked by the compatibility assertions. */
export interface ActionResponse {
  readonly output: unknown;
  readonly action: { readonly actionId: string };
  readonly error: unknown;
}

/** Native administration response fields verified by the legacy assertions. */
export interface AdminResponse {
  readonly record: unknown;
  readonly approval: unknown;
}

/** Public contract response fields selected by compatibility assertions. */
export interface ContractResponse {
  readonly protocol: unknown;
  readonly action: unknown;
  readonly record: unknown;
  readonly approval: unknown;
}

/** Existing public error envelope selected by negative compatibility assertions. */
export interface ErrorResponse {
  readonly error: unknown;
}

/** Publication and dead-letter collections from the public events snapshot. */
export interface EventsResponse {
  readonly publications: readonly unknown[];
  readonly deadLetters: readonly unknown[];
}

/** Public collection items and authoritative graph identity. */
export interface CollectionResponse {
  readonly items: readonly unknown[];
  readonly graphHash: unknown;
}

/**
 * Native job page fields selected by legacy pagination assertions.
 * @typeParam Item - Item fields verified by the corresponding assertion.
 */
export interface PageResponse<Item = unknown> {
  readonly items: readonly Item[];
  readonly nextCursor?: string;
  readonly availability: readonly unknown[];
  readonly partial?: boolean;
  readonly count?: unknown;
  readonly hasMore: boolean;
}

/** Bounded observation collection and optional telemetry snapshot. */
export interface ObservabilityResponse {
  readonly items: readonly unknown[];
  readonly telemetry: unknown;
}

/** Native run identifier retained in public job receipts. */
export interface RunIdentity {
  readonly runId: string;
}

/**
 * Native response contract selected by a minimal legacy observation fixture.
 * @typeParam Method - Declared native query method whose response identity is retained.
 */
export type NativeQueryFixtureResponse<Method extends keyof ObservabilityQuery> = NonNullable<
  Awaited<ReturnType<ObservabilityQuery[Method]>>
>;

/** Native retry receipt contract selected by the intentionally minimal legacy job fixture. */
export type NativeRetryFixtureResponse = Awaited<
  ReturnType<NonNullable<InspectorJobsBinding["retry"]>>
>;
