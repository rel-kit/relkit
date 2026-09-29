import type { JobProcedureSource } from "./generate-job-registry-calculations.types.js";
import { Effect } from "effect";
import { schemaCalculations } from "./generate-schema.js";
import { recordCalculation } from "./generate-schema-render.js";
import { jobTypeCalculations } from "./generate-job-types.js";
import {
  renderReadonlyTypeTupleEffect,
  renderTypeApplicationEffect,
  renderTypeObjectEffect,
  renderTypePropertyEffect,
} from "./generate-type-syntax.js";
import {
  jobProcedureContractEffect,
  jobStreamProcedureContractEffect,
} from "./generate-job-registry-contracts.js";
import {
  cancelInputType,
  getInputType,
  listInputType,
  retryInputType,
  watchInputType,
} from "./generate-job-type-fragments.js";
import { streamInputTypeEffect, triggerInputEffect } from "./generate-job-type-calculations.js";
/** Renders named stream types for one public job.
 * @param source - Normalized job source.
 * @returns An Effect yielding a stream record; it has no expected failure.
 * @example Effect.runSync(streamRecordTypeEffect(source));
 */
export const streamRecordTypeEffect = Effect.fnUntraced(function* (source: JobProcedureSource) {
  const streams = (yield* recordCalculation(source.streams)) ?? {};
  const entries: string[] = [];
  for (const name of source.streamNames)
    entries.push(
      yield* renderTypePropertyEffect(
        JSON.stringify(name),
        yield* schemaCalculations.typeEffect(streams[name]),
        {
          readonly: false,
        },
      ),
    );
  return entries.length === 0
    ? "Readonly<Record<never, never>>"
    : yield* renderTypeObjectEffect(entries);
});
/** Renders the tuple of supported job operation names.
 * @param source - Normalized job source.
 * @returns An Effect yielding an operation tuple; it has no expected failure.
 * @example Effect.runSync(operationsTypeEffect(source));
 */
export const operationsTypeEffect = Effect.fnUntraced(function* (source: JobProcedureSource) {
  return yield* renderReadonlyTypeTupleEffect(
    source.operations.map((operation) => JSON.stringify(operation)),
  );
});
/** Renders the public JobContract type for one job.
 * @param source - Normalized job source.
 * @returns An Effect yielding a contract type; it has no expected failure.
 * @example Effect.runSync(jobRegistryTypeCore(source));
 */
export const jobRegistryTypeCore = Effect.fnUntraced(function* (source: JobProcedureSource) {
  const input = yield* schemaCalculations.typeEffect(source.input);
  const output = yield* schemaCalculations.typeEffect(source.output);
  const failure = yield* jobTypeCalculations.failureEffect(source.errors);
  const progress = yield* schemaCalculations.typeEffect(source.progress);
  const streams = yield* streamRecordTypeEffect(source);
  const operations = yield* operationsTypeEffect(source);
  const fields = yield* jobTypeCalculations.fieldsEffect(source.fields);
  return yield* renderTypeApplicationEffect('import("@relkit/client/jobs").JobContract', [
    JSON.stringify(source.name),
    JSON.stringify(source.jobId),
    input,
    output,
    failure,
    progress,
    streams,
    operations,
    fields,
  ]);
});
/** Renders one job operation's input and output type expression.
 * @param source - Normalized job source.
 * @param operation - Enabled operation name.
 * @returns An Effect yielding a procedure type; it has no expected failure.
 * @example Effect.runSync(jobProcedureTypeEffect(source, "trigger"));
 */
export const jobProcedureTypeEffect = Effect.fnUntraced(function* (
  source: JobProcedureSource,
  operation: JobProcedureSource["operations"][number],
) {
  const error = yield* jobTypeCalculations.failureEffect(source.errors);
  if (operation === "trigger") {
    const input = yield* triggerInputEffect(source);
    return yield* jobProcedureContractEffect(
      input,
      'import("@relkit/contracts/jobs").RunHandle',
      error,
      "mutation",
    );
  }
  if (operation === "get" || operation === "list" || operation === "watch") {
    const snapshot = yield* jobTypeCalculations.snapshotEffect(source);
    if (operation === "get")
      return yield* jobProcedureContractEffect(getInputType, snapshot, error, "query");
    if (operation === "list")
      return yield* jobProcedureContractEffect(
        listInputType,
        yield* renderTypeApplicationEffect('import("@relkit/contracts/jobs").RunPage', [snapshot]),
        error,
        "query",
      );
    return yield* jobStreamProcedureContractEffect(
      watchInputType,
      yield* renderTypeApplicationEffect('import("@relkit/contracts/jobs").RunWatchFrame', [
        snapshot,
      ]),
      error,
      "query",
    );
  }
  if (operation === "stream") {
    const input = yield* streamInputTypeEffect(source);
    const item = yield* jobTypeCalculations.streamItemEffect(source);
    return yield* jobStreamProcedureContractEffect(
      input,
      yield* renderTypeApplicationEffect('import("@relkit/contracts/jobs").NamedStreamFrame', [
        item,
      ]),
      error,
      "query",
    );
  }
  if (operation === "cancel")
    return yield* jobProcedureContractEffect(
      cancelInputType,
      'import("@relkit/contracts/jobs").RunCancellationReceipt',
      error,
      "mutation",
    );
  return yield* jobProcedureContractEffect(
    retryInputType,
    'import("@relkit/contracts/jobs").RunRetryReceipt',
    error,
    "mutation",
  );
});
/** Builds React registry declarations for supported job operations.
 * @param source - Normalized job source.
 * @returns An Effect yielding selector declarations; it has no expected failure.
 * @example Effect.runSync(jobClientRegistryEntriesCore(source));
 */
export const jobClientRegistryEntriesCore = Effect.fnUntraced(function* (
  source: JobProcedureSource,
) {
  const entries: string[] = [];
  for (const operation of source.operations) {
    const selector =
      operation === "trigger"
        ? `jobs.${source.name}.trigger`
        : `jobs.${source.name}.runs.${operation}`;
    const type = yield* jobProcedureTypeEffect(source, operation);
    entries.push(`    ${yield* renderTypePropertyEffect(JSON.stringify(selector), type)};`);
  }
  return entries;
});
