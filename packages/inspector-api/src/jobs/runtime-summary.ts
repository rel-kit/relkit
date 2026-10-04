import type { JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "../native-edge.js";
import { listJobRunsEffect } from "./runs.js";
import { inspectorNativeJobsExecution } from "./native.service.js";
import { isRecord, type ResolvedActiveGeneration } from "../shared.js";

/**
 * Lazily projects a bounded run summary; native failures become availability evidence.
 * @param generation - Active generation supplying native jobs.
 * @returns Public summary requiring InspectorNativeJobs; interruption still propagates.
 */
export const runtimeJobSummaryEffect = Effect.fn("InspectorJobs.summary")(
  (generation: ResolvedActiveGeneration) =>
    listJobRunsEffect(
      generation,
      new Request("http://inspector/_relkit/v1/jobs/runs?limit=25"),
    ).pipe(
      Effect.map((result): JsonValue => {
        if (!isRecord(result)) return unavailable();
        return {
          ...(result.count === undefined ? {} : { count: result.count }),
          items: Array.isArray(result.items) ? result.items : [],
          ...(result.availability === undefined ? {} : { availability: result.availability }),
          ...(result.hasMore === undefined ? {} : { hasMore: result.hasMore }),
        } as JsonValue;
      }),
      Effect.catch(() =>
        Effect.as(Effect.logWarning("Inspector runtime jobs summary unavailable"), unavailable()),
      ),
    ),
  (effect) => observeExecution("inspector", "jobs.summary", effect),
);

/**
 * Reads a run summary through the reused compatibility owner.
 * @param generation - Active native job generation.
 * @returns A redacted bounded summary with explicit unavailable evidence.
 */
export function runtimeJobSummary(generation: ResolvedActiveGeneration): Promise<JsonValue> {
  return runExecutionPromise(inspectorNativeJobsExecution, runtimeJobSummaryEffect(generation));
}

/**
 * Builds the existing unavailable summary envelope.
 * @returns Empty items and truthful availability evidence, without an exact count.
 */
function unavailable(): JsonValue {
  return {
    items: [],
    availability: [{ state: "unavailable", reason: "jobs service unavailable" }],
  };
}
