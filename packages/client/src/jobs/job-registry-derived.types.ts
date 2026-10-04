import type {
  JobErrorEnvelope,
  RunCancellationReceipt,
  RunHandle,
  RunRetryReceipt,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";
import type { JobCancelInput, JobRetryInput } from "./contracts.types.js";
import type { JobFor, JobSelector } from "./job-registry.types.js";

/**
 * Run operations whose job-name selectors are inferred separately.
 */
type JobRunOperation = "watch" | "cancel" | "retry";

/**
 * Names of jobs exposing a declared trigger procedure.
 */
export type JobTriggerName = {
  [Name in JobSelector]: JobFor<Name> extends { readonly trigger: unknown } ? Name : never;
}[JobSelector];

/**
 * Names of jobs exposing the selected run operation.
 * @typeParam Operation - Run operation whose matching job names are selected.
 */
export type JobRunName<Operation extends JobRunOperation> = {
  [Name in JobSelector]: JobFor<Name> extends { readonly runs: infer Runs }
    ? Operation extends keyof Runs
      ? Name
      : never
    : never;
}[JobSelector];

/**
 * Names of jobs exposing native run observation.
 */
export type JobWatchName = JobRunName<"watch">;

/**
 * Names of jobs exposing cancellation receipts.
 */
export type JobCancelName = JobRunName<"cancel">;

/**
 * Names of jobs exposing retry receipts.
 */
export type JobRetryName = JobRunName<"retry">;

/**
 * Infers the declared trigger input while preserving the dynamic fallback.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type JobTriggerInputFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly trigger: infer Trigger }
    ? Trigger extends { readonly input: infer Input }
      ? Input
      : never
    : never
  : unknown;

/**
 * Infers the declared trigger receipt while preserving RunHandle fallback.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type JobTriggerOutputFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly trigger: infer Trigger }
    ? Trigger extends { readonly output: infer Output }
      ? Output
      : never
    : never
  : RunHandle;

/**
 * Infers declared job failures while preserving the standard error envelope fallback.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type JobFailureFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly trigger: infer Trigger }
    ? Trigger extends { readonly error: infer Failure }
      ? Failure
      : JobErrorEnvelope
    : JobErrorEnvelope
  : JobErrorEnvelope;

/**
 * Infers authoritative run payloads from get or watch contracts.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
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

/**
 * Wraps the inferred authoritative run payload in its native watch frame.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type JobWatchFrameFor<Name extends string> = RunWatchFrame<JobRunFor<Name>>;

/**
 * Infers the exact cancellation request or its dynamic fallback.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type JobCancelInputFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly runs: infer Runs }
    ? Runs extends { readonly cancel: infer Cancel }
      ? Cancel extends { readonly input: infer Input }
        ? Input
        : never
      : never
    : never
  : JobCancelInput;

/**
 * Infers the declared cancellation receipt or its standard fallback.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type JobCancelOutputFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly runs: infer Runs }
    ? Runs extends { readonly cancel: infer Cancel }
      ? Cancel extends { readonly output: infer Output }
        ? Output
        : RunCancellationReceipt
      : RunCancellationReceipt
    : RunCancellationReceipt
  : RunCancellationReceipt;

/**
 * Infers the exact retry request or its dynamic fallback.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type JobRetryInputFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly runs: infer Runs }
    ? Runs extends { readonly retry: infer Retry }
      ? Retry extends { readonly input: infer Input }
        ? Input
        : never
      : never
    : never
  : JobRetryInput;

/**
 * Infers the declared retry receipt or its standard fallback.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type JobRetryOutputFor<Name extends string> = Name extends JobSelector
  ? JobFor<Name> extends { readonly runs: infer Runs }
    ? Runs extends { readonly retry: infer Retry }
      ? Retry extends { readonly output: infer Output }
        ? Output
        : RunRetryReceipt
      : RunRetryReceipt
    : RunRetryReceipt
  : RunRetryReceipt;
