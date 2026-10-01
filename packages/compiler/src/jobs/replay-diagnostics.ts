import { observeJobs } from "./observability.js";
import { Effect } from "effect";
import { runJobsSync } from "./compatibility.js";
import type { ReplaySource } from "./replay-diagnostics.types.js";
import { createSourceLocation } from "@relkit/contracts";
import { createDiagnostic } from "@relkit/diagnostics";
import * as ts from "typescript";
import { NORMALIZE_CODES } from "../normalize-codes.js";
import type { NormalizedDescriptor, NormalizationWork } from "../normalize-types.js";
import { isRecord } from "../normalize-utils.js";

import { callName, waitKey, hasUnstableKey, isExternalCall } from "./replay-syntax.js";

const WAIT_NAMES = new Set(["sleep", "sleepUntil"]);

/**
 * Adds bounded warning-only replay advice from caller-supplied source text.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns A lazy effect yielding void after appending advisories for durable task sources.
 * @remarks Requires no services. Unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { validateReplayAdvisoriesEffect } from "./replay-diagnostics.js";
 * // work.input.sources supplies source text; this operation performs no filesystem reads.
 * Effect.runSync(validateReplayAdvisoriesEffect(work));
 * ```
 */
export const validateReplayAdvisoriesEffect = Effect.fn("Jobs.validateReplayAdvisories")(
  function* (work: NormalizationWork) {
    yield* Effect.forEach(
      work.descriptors.filter((entry) => entry.kind === "task"),
      (task) =>
        Effect.gen(function* () {
          const value = isRecord(task.value) ? task.value : {};
          if (value.execution === "retryable") return;
          const source = sourceFor(work, task);
          if (source === undefined) return;
          yield* inspectWaitsEffect(work, task, source.file, source.text);
        }),
      { discard: true },
    );
  },
  (effect, work) =>
    observeJobs("replayAdvisories", effect, () => ({ descriptors: work.descriptors.length })),
);

/**
 * Adds bounded warning-only replay advice from caller-supplied source text.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns void after appending advisories for durable task sources.
 * @see {@link validateReplayAdvisoriesEffect} for composition and execution examples.
 */
export function validateReplayAdvisories(work: NormalizationWork): void {
  return runJobsSync(validateReplayAdvisoriesEffect(work));
}

/**
 * Examines durable waits for unstable identity and preceding external operations.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param descriptor - Descriptor whose identity or source is being inspected.
 * @param file - Source path supplied by the compiler input.
 * @param source - Caller-supplied source text, or serialized manifest bytes.
 * @returns A lazy effect yielding void after appending source-positioned replay warnings.
 * @remarks Requires no services. Validation findings append diagnostics; unexpected exceptions remain defects.
 */
const inspectWaitsEffect = Effect.fn("Jobs.inspectWaits")(function* (
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  file: string,
  source: string,
) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const calls: ts.CallExpression[] = [];
  const waits: ts.CallExpression[] = [];
  /**
   * Collects calls in syntactic source order for warning-only replay analysis.
   * @param node - Current TypeScript syntax node.
   * @returns Nothing; calls and waits are accumulated without evaluating source.
   */
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      calls.push(node);
      const name = callName(node);
      if (name !== undefined && WAIT_NAMES.has(name)) waits.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  for (const wait of waits) {
    const offset = wait.getStart(sourceFile);
    const key = waitKey(wait);
    if (key === undefined || hasUnstableKey(key)) {
      warning(
        work,
        descriptor,
        file,
        source,
        offset,
        "Durable wait identity is not derived from a stable input or explicit constant.",
        "Use an accepted-input-derived or versioned constant key so replay resumes the same wait.",
      );
    }
    if (calls.some((call) => call.getStart(sourceFile) < offset && isExternalCall(call))) {
      warning(
        work,
        descriptor,
        file,
        source,
        offset,
        "External work appears before a durable wait and may repeat during replay.",
        "Move the effect behind an idempotency key or durable outbox and make the operation replay-safe.",
      );
    }
  }
});

/**
 * Appends a replay advisory with the supplied source offset.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param descriptor - Descriptor whose identity or source is being inspected.
 * @param file - Source path supplied by the compiler input.
 * @param source - Caller-supplied source text, or serialized manifest bytes.
 * @param offset - Zero-based UTF-16 position of the advisory.
 * @param message - Human-readable replay advisory.
 * @param suggestion - Actionable replay recovery guidance.
 * @returns nothing; work receives a warning diagnostic.
 */
function warning(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  file: string,
  source: string,
  offset: number,
  message: string,
  suggestion: string,
): void {
  const position = source.slice(0, offset).split("\n");
  work.diagnostics.push(
    createDiagnostic({
      code: NORMALIZE_CODES.jobReplay,
      severity: "warning",
      message,
      descriptorId: descriptor.id,
      location: createSourceLocation(file, position.length, (position.at(-1)?.length ?? 0) + 1),
      suggestion,
    }),
  );
}

/**
 * Finds source text already supplied for a descriptor's normalized path.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param descriptor - Descriptor whose identity or source is being inspected.
 * @returns the matching file and text, or undefined when no source was supplied.
 */
function sourceFor(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
): ReplaySource | undefined {
  const target = descriptor.source.file.replaceAll("\\", "/").replace(/^\.\//u, "");
  return work.input.sources
    ?.map((source) => ({
      file: source.fileName.replaceAll("\\", "/").replace(/^\.\//u, ""),
      text: source.text,
    }))
    .find((source) => source.file === target || source.file.endsWith(`/${target}`));
}
