import type { JobProcedureSource } from "./generate-job-procedure-entries.types.js";
import { Effect } from "effect";
import {
  cancelInputType,
  cancelOutputType,
  getInputType,
  listInputType,
  retryInputType,
  retryOutputType,
  runHandleType,
  watchInputType,
} from "./generate-job-type-fragments.js";
import {
  jobSnapshotTypeCore,
  pageTypeEffect,
  streamFrameTypeEffect,
  streamInputTypeEffect,
  triggerInputEffect,
  watchFrameTypeEffect,
} from "./generate-job-type-calculations.js";
/** Renders nested oRPC entries for normalized public job sources.
 * @param sources - Jobs in canonical public order.
 * @returns An Effect yielding job entries; it has no expected failure.
 * @example Effect.runSync(jobProcedureEntrySourcesCore([]));
 */
export const jobProcedureEntrySourcesCore = Effect.fnUntraced(function* (
  sources: readonly JobProcedureSource[],
) {
  if (sources.length === 0) return [];
  const jobs: string[] = [];
  for (const source of sources) {
    const members: string[] = [];
    if (source.operations.includes("trigger")) {
      const input = yield* triggerInputEffect(source);
      members.push(
        `      ${JSON.stringify("trigger")}: oc.input(schema<${input}>()).output(schema<${runHandleType}>()),`,
      );
    }
    const runs: string[] = [];
    if (source.operations.includes("get")) {
      const snapshot = yield* jobSnapshotTypeCore(source);
      runs.push(
        `        ${JSON.stringify("get")}: oc.input(schema<${getInputType}>()).output(schema<${snapshot}>()),`,
      );
    }
    if (source.operations.includes("list")) {
      const page = yield* pageTypeEffect(source);
      runs.push(
        `        ${JSON.stringify("list")}: oc.input(schema<${listInputType}>()).output(schema<${page}>()),`,
      );
    }
    if (source.operations.includes("watch")) {
      const frame = yield* watchFrameTypeEffect(source);
      runs.push(
        `        ${JSON.stringify("watch")}: oc.input(schema<${watchInputType}>()).output(schema<AsyncIterable<${frame}> >()),`,
      );
    }
    if (source.operations.includes("stream")) {
      const input = yield* streamInputTypeEffect(source);
      const frame = yield* streamFrameTypeEffect(source);
      runs.push(
        `        ${JSON.stringify("stream")}: oc.input(schema<${input}>()).output(schema<AsyncIterable<${frame}> >()),`,
      );
    }
    if (source.operations.includes("cancel"))
      runs.push(
        `        ${JSON.stringify("cancel")}: oc.input(schema<${cancelInputType}>()).output(schema<${cancelOutputType}>()),`,
      );
    if (source.operations.includes("retry"))
      runs.push(
        `        ${JSON.stringify("retry")}: oc.input(schema<${retryInputType}>()).output(schema<${retryOutputType}>()),`,
      );
    if (runs.length > 0) members.push(`      ${JSON.stringify("runs")}: {`, ...runs, "      },");
    jobs.push([`    ${JSON.stringify(source.name)}: {`, ...members, "    },"].join("\n"));
  }
  return [`  ${JSON.stringify("jobs")}: {`, ...jobs, "  },"];
});
