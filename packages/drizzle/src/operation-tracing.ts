import { observeExecution } from "@relkit/contracts/operation";
import { Effect } from "effect";
import { frameworkTrace } from "@relkit/invocation";
import { redactSpecializedTrace } from "./trace-redaction.js";

const operations = new Set([
  "database.acquire",
  "database.close",
  "database.findOne",
  "database.findMany",
  "database.insert",
  "database.update",
  "database.upsert",
  "database.delete",
  "database.transaction",
  "database.extension",
  "auth.acquire",
  "auth.handler",
  "auth.session",
  "auth.api",
  "auth.factory",
]);

/**
 * Observes specialized work once through the configured caller sinks.
 * @typeParam A - Successful value.
 * @typeParam E - Typed failure retained together with defects/interruption.
 * @typeParam R - Required caller services.
 * @param operation - Bounded label; custom method names are normalized.
 * @param effect - Lazy authoritative work; payloads are never recorded.
 * @returns An observed Effect retaining values, causes and requirements.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { observeSpecializedOperation } from "@relkit/drizzle/internal";
 * await Effect.runPromise(observeSpecializedOperation("auth.session", Effect.succeed(null)));
 * ```
 */
export function observeSpecializedOperation<A, E, R>(
  operation: `database.${string}` | `auth.${string}`,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const label = operations.has(operation)
    ? operation
    : operation.startsWith("database.")
      ? "database.extension"
      : "auth.api";
  return redactSpecializedTrace(
    observeExecution("runtime", label, effect, () => ({ operations: 1 })).pipe(
      Effect.withSpan(`relkit.${label}`),
    ),
  );
}

/**
 * Bridges invocation parenting without capturing native rows or auth sessions.
 * @typeParam A - Private operation result.
 * @param operation - Bounded operation label.
 * @param run - Existing runtime boundary.
 * @returns Original result; the invocation span sees only void.
 */
export async function runSpecializedTrace<A>(operation: string, run: () => Promise<A>): Promise<A> {
  let result: { readonly value: A } | undefined;
  let failure: { readonly cause: unknown } | undefined;
  try {
    await frameworkTrace.span(`relkit.${operation}`, {}, async () => {
      try {
        result = { value: await run() };
      } catch (cause) {
        failure = { cause };
        // Native SDK messages may include SQL, tokens or row values. Preserve
        // the native rejection privately while tracing only bounded failure text.
        throw new Error("Specialized operation failed");
      }
    });
  } catch (cause) {
    throw failure === undefined ? cause : failure.cause;
  }
  if (result === undefined) throw new TypeError("Specialized operation did not complete");
  return result.value;
}
