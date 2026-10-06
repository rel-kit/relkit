import type { CliCommandContext } from "../main-support-types.js";

/** Pure normalized jobs arguments; repeated filters retain their input order. */
export interface ParsedJobs {
  readonly path: readonly string[];
  readonly options: Readonly<Record<string, string>>;
  readonly repeated: Readonly<Record<string, readonly string[]>>;
  readonly projectRoot: string;
}
/** Existing optional jobs REST payload and caller cancellation. */
export interface JobsRequestOptions {
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}
/** Public manifest projection; entry validation remains owned by the compiler. */
export interface JobsManifestView {
  readonly jobs?: readonly unknown[];
  readonly recipes?: readonly unknown[];
  readonly serviceGenerations?: readonly unknown[];
  readonly jobsProtocolVersion?: number;
}
/** Existing finite command presentation settings. */
export type JobsCommandContext = Pick<CliCommandContext, "json" | "reporter" | "signal">;
/** Native projected watch-frame presentation settings. */
export type JobsWatchContext = Pick<CliCommandContext, "reporter" | "signal">;
/** Mutation recovery identifiers retained by the existing public diagnostic. */
export interface JobsUnknownReceipt {
  readonly operationId: string;
  readonly idempotencyKey?: string;
}
