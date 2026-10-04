import type { ExpectedClientIdentity, OperationId } from "@relkit/contracts";
import type { RunListQuery } from "@relkit/contracts/jobs";

/** Filters accepted by a generated job-specific list; ownership is server-derived. */
export type JobListQuery = Omit<RunListQuery, "jobId" | "service">;

/**
 * Client-visible run projection fields.
 */
export type JobClientField = "status" | "input" | "progress" | "output" | "error";

/** Browser-safe options accepted by a generated job trigger. */
export interface JobTriggerOptions {
  readonly operationId?: OperationId | string;
  readonly idempotencyKey?: string;
  readonly delay?: string;
  readonly at?: string;
  readonly tags?: readonly string[];
  readonly correlationId?: string;
}

/**
 * Generated finite procedure shape preserving input, output and failure inference.
 * @typeParam Input - Original declared request payload.
 * @typeParam Output - Application-declared successful result payload.
 * @typeParam Failure - Declared procedure failure exposed by the existing contract.
 */
export interface JobProcedureContract<Input, Output, Failure = Error> {
  readonly input: Input;
  readonly output: Output;
  readonly error: Failure;
  readonly operation: "query" | "mutation";
  readonly stream: false;
}

/**
 * Generated stream procedure shape preserving item and failure inference.
 * @typeParam Input - Original declared request payload.
 * @typeParam Item - Individual declared stream item payload.
 * @typeParam Failure - Declared procedure failure exposed by the existing contract.
 */
export interface JobStreamProcedureContract<Input, Item, Failure = Error> {
  readonly input: Input;
  readonly output: AsyncIterable<Item>;
  readonly item: Item;
  readonly error: Failure;
  readonly operation: "query" | "mutation";
  readonly stream: true;
}

/**
 * Job trigger request and expected application identity.
 * @typeParam Input - Original declared request payload.
 */
export type JobTriggerInput<Input> = {
  readonly input: Input;
  readonly options?: JobTriggerOptions;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

/**
 * Authoritative run lookup and expected application identity.
 */
export type JobGetInput = {
  readonly runId: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

/**
 * Job-specific listing filters and expected application identity.
 */
export type JobListInput = {
  readonly query?: JobListQuery;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

/**
 * Run observation cursor and expected application identity.
 */
export type JobWatchInput = {
  readonly runId: string;
  readonly after?: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

/**
 * Named content observation cursor and expected application identity.
 * @typeParam StreamName - Declared named content stream key.
 */
export type JobStreamInput<StreamName extends string = string> = {
  readonly runId: string;
  readonly name: StreamName;
  readonly after?: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

/**
 * Cancellation request with caller-owned operation identity.
 */
export type JobCancelInput = {
  readonly runId: string;
  readonly operationId: OperationId | string;
  readonly reason?: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

/**
 * Retry request with caller-owned operation identity.
 */
export type JobRetryInput = {
  readonly runId: string;
  readonly operationId: OperationId | string;
  readonly expectedIdentity?: ExpectedClientIdentity;
};
