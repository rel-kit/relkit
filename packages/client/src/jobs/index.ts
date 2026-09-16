import type { ExpectedClientIdentity, OperationId } from "@relkit/contracts";
import type { RunListQuery } from "@relkit/contracts/jobs";

export type {
  JobClientOperation,
  JobErrorEnvelope,
  JobRunStatus,
  NamedStreamFrame,
  RunCancellationReceipt,
  RunHandle,
  RunListQuery,
  RunPage,
  RunRetryReceipt,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";

/** Filters accepted by a generated job-specific list; ownership is server-derived. */
export type JobListQuery = Omit<RunListQuery, "jobId" | "service">;

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

export interface JobProcedureContract<Input, Output, Failure = Error> {
  readonly input: Input;
  readonly output: Output;
  readonly error: Failure;
  readonly operation: "query" | "mutation";
  readonly stream: false;
}

export interface JobStreamProcedureContract<Input, Item, Failure = Error> {
  readonly input: Input;
  readonly output: AsyncIterable<Item>;
  readonly item: Item;
  readonly error: Failure;
  readonly operation: "query" | "mutation";
  readonly stream: true;
}

export type JobTriggerInput<Input> = {
  readonly input: Input;
  readonly options?: JobTriggerOptions;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

export type JobGetInput = {
  readonly runId: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

export type JobListInput = {
  readonly query?: JobListQuery;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

export type JobWatchInput = {
  readonly runId: string;
  readonly after?: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

export type JobStreamInput<StreamName extends string = string> = {
  readonly runId: string;
  readonly name: StreamName;
  readonly after?: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

export type JobCancelInput = {
  readonly runId: string;
  readonly operationId: OperationId | string;
  readonly reason?: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

export type JobRetryInput = {
  readonly runId: string;
  readonly operationId: OperationId | string;
  readonly expectedIdentity?: ExpectedClientIdentity;
};

export type {
  JobContract,
  JobFor,
  JobProcedureSelector,
  JobRegistry,
  JobSelector,
  JobSnapshotFor,
  JobTriggerSelector,
  JobRunSelector,
  SelectedJobField,
} from "./job-registry-types.js";
export type {
  JobCancelInputFor,
  JobCancelOutputFor,
  JobFailureFor,
  JobRetryInputFor,
  JobRetryOutputFor,
  JobRunFor,
  JobTriggerInputFor,
  JobTriggerOutputFor,
  JobWatchFrameFor,
  JobCancelName,
  JobRetryName,
  JobTriggerName,
  JobWatchName,
} from "./job-registry-derived.js";

export type {
  JobWatchController,
  JobWatchFrame,
  JobWatchListener,
  JobWatchOptions,
  JobWatchState,
} from "./types.js";
export {
  JobWatchAbortedError,
  JobWatchDisposedError,
  JobWatchUnavailableError,
  JobWatchReadTimeoutError,
} from "./types.js";
export { JobRunWatchController, watchJobRun } from "./controller.js";
export { JobStreamGapError, JobStreamOverflowError, watchJobStream } from "./stream.js";
export type { JobStreamOptions } from "./stream.js";
