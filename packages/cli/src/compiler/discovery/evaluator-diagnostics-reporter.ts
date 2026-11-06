/**
 * Receives warnings that application code reports through `relkit/diagnostics` while a candidate
 * is imported, such as the final `@relkit/app` deprecation notice. Without a reporter that notice
 * is written to the terminal, which the side-effect detector counts as direct output.
 */
import { Effect } from "effect";
import type { EvaluatorWarning } from "./evaluator-protocol.types.js";

/** The key `relkit/diagnostics` looks up; `Symbol.for` shares it across copies of `relkit`. */
const reporterKey = Symbol.for("relkit.diagnostics.reporter");

/**
 * Installs a reporter for one candidate import and restores the previous one when the scope closes.
 * @param module - Candidate source path the warnings are attributed to.
 * @returns A scoped effect yielding the list that collects the candidate's warnings.
 */
export const acquireDiagnosticsReporter = Effect.fn("Discovery.acquireDiagnosticsReporter")(
  function* (module: string) {
    const warnings: EvaluatorWarning[] = [];
    const report = (warning: unknown) => {
      if (warning === null || typeof warning !== "object") return;
      const code: unknown = Reflect.get(warning, "code");
      const message: unknown = Reflect.get(warning, "message");
      if (typeof code === "string" && typeof message === "string")
        warnings.push({ code, message, module });
    };
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const previous: unknown = Reflect.get(globalThis, reporterKey);
        Reflect.set(globalThis, reporterKey, report);
        return previous;
      }),
      (previous) =>
        Effect.sync(() =>
          previous === undefined
            ? Reflect.deleteProperty(globalThis, reporterKey)
            : Reflect.set(globalThis, reporterKey, previous),
        ),
    );
    return warnings;
  },
);
