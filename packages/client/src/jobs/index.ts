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
