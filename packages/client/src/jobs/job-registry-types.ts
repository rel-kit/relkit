import type {
  JobClientOperation,
  JobErrorEnvelope,
  NamedStreamFrame,
  RunCancellationReceipt,
  RunHandle,
  RunPage,
  RunRetryReceipt,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";
import type {
  JobClientField,
  JobCancelInput,
  JobGetInput,
  JobListInput,
  JobProcedureContract,
  JobRetryInput,
  JobStreamInput,
  JobStreamProcedureContract,
  JobTriggerInput,
  JobWatchInput,
} from "./index.js";

export type SelectedJobField<
  Fields extends readonly JobClientField[],
  Field extends JobClientField,
> = Field extends Fields[number] ? true : false;

export type JobSnapshotFor<
  Input,
  Output,
  Progress,
  Failure,
  Fields extends readonly JobClientField[],
> = RunSnapshot<
  SelectedJobField<Fields, "input"> extends true ? Input : never,
  SelectedJobField<Fields, "output"> extends true ? Output : never,
  SelectedJobField<Fields, "progress"> extends true ? Progress : never,
  SelectedJobField<Fields, "error"> extends true ? Failure : never
>;

type TriggerMember<
  Input,
  Failure,
  Operations extends readonly JobClientOperation[],
> = "trigger" extends Operations[number]
  ? {
      readonly trigger: JobProcedureContract<JobTriggerInput<Input>, RunHandle, Failure>;
    }
  : {};

type RunMembers<
  Input,
  Output,
  Progress,
  Failure,
  Streams extends Readonly<Record<string, unknown>>,
  Operations extends readonly JobClientOperation[],
  Fields extends readonly JobClientField[],
> =
  Extract<
    Operations[number],
    "get" | "list" | "watch" | "stream" | "cancel" | "retry"
  > extends never
    ? {}
    : {
        readonly runs: RunMembersFor<Input, Output, Progress, Failure, Streams, Operations, Fields>;
      };

type RunMembersFor<
  Input,
  Output,
  Progress,
  Failure,
  Streams extends Readonly<Record<string, unknown>>,
  Operations extends readonly JobClientOperation[],
  Fields extends readonly JobClientField[],
> = {
  readonly [
    Operation in Extract<
      Operations[number],
      "get" | "list" | "watch" | "stream" | "cancel" | "retry"
    >
  ]: Operation extends "get"
    ? JobProcedureContract<
        JobGetInput,
        JobSnapshotFor<Input, Output, Progress, Failure, Fields>,
        Failure
      >
    : Operation extends "list"
      ? JobProcedureContract<
          JobListInput,
          RunPage<JobSnapshotFor<Input, Output, Progress, Failure, Fields>>,
          Failure
        >
      : Operation extends "watch"
        ? JobStreamProcedureContract<
            JobWatchInput,
            RunWatchFrame<JobSnapshotFor<Input, Output, Progress, Failure, Fields>>,
            Failure
          >
        : Operation extends "stream"
          ? JobStreamProcedureContract<
              JobStreamInput<Extract<keyof Streams, string>>,
              NamedStreamFrame<Streams[Extract<keyof Streams, string>]>,
              Failure
            >
          : Operation extends "cancel"
            ? JobProcedureContract<JobCancelInput, RunCancellationReceipt, Failure>
            : JobProcedureContract<JobRetryInput, RunRetryReceipt, Failure>;
};

export type JobContract<
  Name extends string = string,
  JobId extends string = string,
  Input = unknown,
  Output = unknown,
  Failure = JobErrorEnvelope,
  Progress = unknown,
  Streams extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  Operations extends readonly JobClientOperation[] = readonly JobClientOperation[],
  Fields extends readonly JobClientField[] = readonly [],
> = {
  readonly name: Name;
  readonly jobId: JobId;
} & TriggerMember<Input, Failure, Operations> &
  RunMembers<Input, Output, Progress, Failure, Streams, Operations, Fields>;

export interface JobRegistry {}

export type JobSelector = Extract<keyof JobRegistry, string>;
export type JobFor<Name extends JobSelector> = JobRegistry[Name];

export type JobTriggerSelector<Name extends JobSelector> =
  JobFor<Name> extends { readonly trigger: unknown } ? `${Name}.trigger` : never;
export type JobRunSelector<Name extends JobSelector> =
  JobFor<Name> extends { readonly runs: infer Runs }
    ? {
        [
          Operation in "get" | "list" | "watch" | "stream" | "cancel" | "retry"
        ]: Runs extends Record<Operation, unknown>
          ? Runs[Operation] extends never
            ? never
            : `${Name}.runs.${Operation}`
          : never;
      }["get" | "list" | "watch" | "stream" | "cancel" | "retry"]
    : never;

export type JobProcedureSelector<Name extends JobSelector = JobSelector> =
  JobTriggerSelector<Name> | JobRunSelector<Name>;
