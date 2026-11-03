import { Cause, Clock, Effect, Exit, Metric } from "effect";
import type {
  CompilerStage,
  CompilerWorkload,
  CompilerOperation,
  MutableCompilerWorkload,
} from "./observability.types.js";

/** Executions counted once by the owning operation, including standalone calls. */
const calls = Metric.counter("relkit_compiler_operations_total", { incremental: true });

/** Distinguishes expected failures, defects, and interruption. */
const outcomes = Metric.counter("relkit_compiler_outcomes_total", { incremental: true });

/** Monotonic operation duration in milliseconds. */
const duration = Metric.histogram("relkit_compiler_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100, 1000],
});

/** Workload counts associated with an operation's fixed label. */
const workload = Metric.counter("relkit_compiler_workload_total", { incremental: true });

/**
 * Records operation context, completion, duration, and workload in the caller's runtime.
 * @typeParam A - Successful operation result.
 * @typeParam E - Expected operation failures.
 * @typeParam R - Required runtime services.
 * @param stage - Fixed compiler stage.
 * @param operation - Declaration-owned operation label; never an input ID or path.
 * @param effect - Lazy operation body, normally named with Effect.fn.
 * @param counts - Lazy input counts evaluated at the start of the operation lifetime.
 * @param emitLogs - False while native evaluator output hooks are owned, avoiding candidate output contamination.
 * @returns A lazy effect preserving all channels, including defects and interruption.
 * @remarks Compatibility adapters do not instrument again. Runtime edges provision sinks.
 */
export function observeCompiler<A, E, R>(
  stage: CompilerStage,
  operation: CompilerOperation,
  effect: Effect.Effect<A, E, R>,
  counts: () => CompilerWorkload = () => ({}),
  emitLogs = true,
): Effect.Effect<A, E, R> {
  const attributes = { stage, operation };
  return Effect.gen(function* () {
    const started = yield* Clock.monotonicTimeNanos;
    yield* Metric.update(Metric.withAttributes(calls, attributes), 1);
    yield* Effect.annotateCurrentSpan("compiler.stage", stage);
    yield* Effect.annotateCurrentSpan("compiler.operation", operation);
    const body = Effect.gen(function* () {
      const inputs = counts();
      yield* recordWorkload(stage, operation, inputs);
      const result = yield* effect;
      const outputs = resultWorkload(result, operation);
      for (const kind of Object.keys(inputs)) delete outputs[kind as keyof CompilerWorkload];
      yield* recordWorkload(stage, operation, outputs);
      return result;
    });
    return yield* Effect.onExit(body, (exit) =>
      Effect.gen(function* () {
        const outcome = Exit.isSuccess(exit)
          ? "success"
          : Cause.hasInterrupts(exit.cause)
            ? "interrupted"
            : Cause.hasDies(exit.cause)
              ? "defect"
              : "failure";
        const elapsed = Math.max(
          0,
          Number((yield* Clock.monotonicTimeNanos) - started) / 1_000_000,
        );
        yield* Metric.update(Metric.withAttributes(duration, attributes), elapsed);
        yield* Metric.update(Metric.withAttributes(outcomes, { ...attributes, outcome }), 1);
        yield* Effect.annotateCurrentSpan("compiler.outcome", outcome);
        yield* Effect.annotateCurrentSpan("compiler.duration_ms", elapsed);
        if (emitLogs)
          yield* Effect.annotateLogs(
            Effect.logDebug(
              outcome === "failure" || outcome === "defect"
                ? "Compiler operation failed"
                : "Compiler operation completed",
            ),
            { ...attributes, outcome, duration_ms: elapsed },
          );
      }),
    );
  });
}

/**
 * Records known workload fields without adding spans or executions.
 * @param stage - Fixed owning stage.
 * @param operation - Declaration-owned operation label.
 * @param counts - Counts of inspected inputs or emitted outputs.
 * @returns A lazy effect updating the supplied runtime's metrics and span.
 */
function recordWorkload(
  stage: CompilerStage,
  operation: CompilerOperation,
  counts: CompilerWorkload,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    yield* Effect.forEach(
      Object.entries(counts),
      ([kind, count]) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan(`compiler.${kind}`, count);
          yield* Metric.update(Metric.withAttributes(workload, { stage, operation, kind }), count);
        }),
      { discard: true },
    );
  });
}

/**
 * Reads counts from trusted compiler outputs without using their contents as labels.
 * @param value - Successful value returned by the owning operation.
 * @param operation - Fixed label selecting operation-owned collection counts.
 * @returns Fixed workload fields applicable to that result.
 */
function resultWorkload(value: unknown, operation: CompilerOperation): MutableCompilerWorkload {
  if (typeof value === "string") return { bytes: Buffer.byteLength(value, "utf8") };
  if (Array.isArray(value)) {
    if (
      ["checkConventions", "eventSourceDiagnostics", "typecheckProject", "validateConfig"].includes(
        operation,
      )
    )
      return { diagnostics: value.length };
    if (operation === "extractDescriptors") return { descriptors: value.length };
    if (operation === "runtimeRegistrations") return { registrations: value.length };
    return { entries: value.length };
  }
  if (value === null || typeof value !== "object") return {};
  const result = value as Record<string, unknown>;
  const output: MutableCompilerWorkload = {};
  if (result.$relkit === "schema" || result.$relkit === "schema-unavailable") output.schemas = 1;
  for (const field of ["descriptors", "diagnostics", "nodes", "edges"] as const) {
    if (Array.isArray(result[field])) output[field] = result[field].length;
  }
  if (typeof result.source === "string") output.bytes = Buffer.byteLength(result.source, "utf8");
  if (typeof result.bytes === "number") output.bytes = result.bytes;
  if (typeof result.changed === "boolean") output.changed = result.changed ? 1 : 0;
  if (typeof result.graph === "string") {
    const sources = [
      "graph",
      "manifest",
      "jobsManifest",
      "runtimeActivation",
      "runtimeIntegrations",
      "runtimeIntegrationImports",
      "localServices",
      "diagnostics",
      "openapi",
      "client",
      "contract",
      "clientContract",
      "clientRegistry",
      "clientManifest",
    ] as const;
    output.artifacts = sources.filter((key) => typeof result[key] === "string").length;
    output.bytes = sources.reduce(
      (bytes, key) =>
        bytes + (typeof result[key] === "string" ? Buffer.byteLength(result[key], "utf8") : 0),
      0,
    );
  }
  if (Array.isArray(result.writes)) {
    output.artifacts = result.writes.length;
    output.bytes = result.writes.reduce((bytes, write) => bytes + write.bytes, 0);
  }
  return output;
}
