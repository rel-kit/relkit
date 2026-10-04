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
} from "./contracts.types.js";
import type { JobRegistry } from "./job-registry-types.js";

/**
 * Tests whether a projection field belongs to the declared visible field set.
 * @typeParam Fields - Declared set of visible client projection fields.
 * @typeParam Field - Candidate client projection field.
 */
export type SelectedJobField<
  Fields extends readonly JobClientField[],
  Field extends JobClientField,
> = Field extends Fields[number] ? true : false;

/**
 * Projects run payload fields according to the declared client visibility contract.
 * @typeParam Input - Application-declared request input payload.
 * @typeParam Output - Application-declared successful output payload.
 * @typeParam Progress - Application-declared run progress payload.
 * @typeParam Failure - Declared procedure failure payload.
 * @typeParam Fields - Declared set of visible client projection fields.
 */
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

/**
 * Includes the generated trigger member only when the operation is declared.
 * @typeParam Input - Application-declared request input payload.
 * @typeParam Failure - Declared procedure failure payload.
 * @typeParam Operations - Declared available job operation set.
 */
type TriggerMember<
  Input,
  Failure,
  Operations extends readonly JobClientOperation[],
> = "trigger" extends Operations[number]
  ? {
      readonly trigger: JobProcedureContract<JobTriggerInput<Input>, RunHandle, Failure>;
    }
  : {};

/**
 * Includes run procedures only when the contract declares a run operation.
 * @typeParam Input - Application-declared request input payload.
 * @typeParam Output - Application-declared successful output payload.
 * @typeParam Progress - Application-declared run progress payload.
 * @typeParam Failure - Declared procedure failure payload.
 * @typeParam Streams - Declared named content stream item map.
 * @typeParam Operations - Declared available job operation set.
 * @typeParam Fields - Declared set of visible client projection fields.
 */
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

/**
 * Maps each declared run operation to its exact input, output and failure shape.
 * @typeParam Input - Application-declared request input payload.
 * @typeParam Output - Application-declared successful output payload.
 * @typeParam Progress - Application-declared run progress payload.
 * @typeParam Failure - Declared procedure failure payload.
 * @typeParam Streams - Declared named content stream item map.
 * @typeParam Operations - Declared available job operation set.
 * @typeParam Fields - Declared set of visible client projection fields.
 */
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

/**
 * Generated job declaration retaining operation availability and selective field inference.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 * @typeParam JobId - Stable declared job definition identity.
 * @typeParam Input - Application-declared request input payload.
 * @typeParam Output - Application-declared successful output payload.
 * @typeParam Failure - Declared procedure failure payload.
 * @typeParam Progress - Application-declared run progress payload.
 * @typeParam Streams - Declared named content stream item map.
 * @typeParam Operations - Declared available job operation set.
 * @typeParam Fields - Declared set of visible client projection fields.
 */
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

/**
 * String keys of the application-declared job registry.
 */
export type JobSelector = Extract<keyof JobRegistry, string>;

/**
 * Looks up one declared job contract without widening its members.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type JobFor<Name extends JobSelector> = JobRegistry[Name];

/**
 * Produces the exact trigger selector only for trigger-capable jobs.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type JobTriggerSelector<Name extends JobSelector> =
  JobFor<Name> extends { readonly trigger: unknown } ? `${Name}.trigger` : never;

/**
 * Produces exact selectors for the declared run operations.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
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

/**
 * Union of exact procedure selectors exposed by one declared job.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type JobProcedureSelector<Name extends JobSelector = JobSelector> =
  JobTriggerSelector<Name> | JobRunSelector<Name>;
