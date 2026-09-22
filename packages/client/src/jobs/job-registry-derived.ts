import type {
  JobErrorEnvelope,
  RunCancellationReceipt,
  RunHandle,
  RunRetryReceipt,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";
import type { JobCancelInput, JobRetryInput } from "./index.js";
import type { JobFor, JobSelector } from "./job-registry-types.js";

type JobRunOperation = "watch" | "cancel" | "retry";

export type JobTriggerName = {
  [Name in JobSelector]: JobFor<Name> extends { readonly trigger: unknown } ? Name : never;
}[JobSelector];

export type JobRunName<Operation extends JobRunOperation> = {
  [Name in JobSelector]: JobFor<Name> extends { readonly runs: infer Runs }
    ? Operation extends keyof Runs
      ? Name
      : never
    : never;
}[JobSelector];

export type JobWatchName = JobRunName<"watch">;
export type JobCancelName = JobRunName<"cancel">;
export type JobRetryName = JobRunName<"retry">;

export type JobTriggerInputFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly trigger: infer Trigger }
    ? Trigger extends { readonly input: infer Input }
      ? Input
      : never
    : never
  : unknown;

export type JobTriggerOutputFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly trigger: infer Trigger }
    ? Trigger extends { readonly output: infer Output }
      ? Output
      : never
    : never
  : RunHandle;

export type JobFailureFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly trigger: infer Trigger }
    ? Trigger extends { readonly error: infer Failure }
      ? Failure
      : JobErrorEnvelope
    : JobErrorEnvelope
  : JobErrorEnvelope;

export type JobRunFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly runs: infer Runs }
    ? Runs extends { readonly get: infer Get }
      ? Get extends { readonly output: infer Output }
        ? Output
        : RunSnapshot
      : Runs extends { readonly watch: infer Watch }
        ? Watch extends { readonly output: AsyncIterable<infer Frame> }
          ? Frame extends { readonly run: infer Run }
            ? Run
            : RunSnapshot
          : RunSnapshot
        : RunSnapshot
    : RunSnapshot
  : RunSnapshot;

export type JobWatchFrameFor<Name extends string> = RunWatchFrame<JobRunFor<Name>>;

export type JobCancelInputFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly runs: infer Runs }
    ? Runs extends { readonly cancel: infer Cancel }
      ? Cancel extends { readonly input: infer Input }
        ? Input
        : never
      : never
    : never
  : JobCancelInput;

export type JobCancelOutputFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly runs: infer Runs }
    ? Runs extends { readonly cancel: infer Cancel }
      ? Cancel extends { readonly output: infer Output }
        ? Output
        : RunCancellationReceipt
      : RunCancellationReceipt
    : RunCancellationReceipt
  : RunCancellationReceipt;

export type JobRetryInputFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly runs: infer Runs }
    ? Runs extends { readonly retry: infer Retry }
      ? Retry extends { readonly input: infer Input }
        ? Input
        : never
      : never
    : never
  : JobRetryInput;

export type JobRetryOutputFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly runs: infer Runs }
    ? Runs extends { readonly retry: infer Retry }
      ? Retry extends { readonly output: infer Output }
        ? Output
        : RunRetryReceipt
      : RunRetryReceipt
    : RunRetryReceipt
  : RunRetryReceipt;
