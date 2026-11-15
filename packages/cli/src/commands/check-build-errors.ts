/**
 * Projects an evaluator import failure that carries located parse errors (a module that does not
 * parse) into a diagnostic at the first parse error's own file, line and column, with the parser's
 * message; further errors are listed briefly after it, by position in the same file and by path
 * otherwise. `check-support.ts` uses it for `relkit check` and for the reload failures that
 * `relkit dev` reports, and keys root causes by the first error's location so two files with the
 * same parse message stay two diagnostics.
 */
import { createDiagnostic, type Diagnostic } from "relkit/diagnostics";

/** A located parse error as the evaluator reports it. */
interface BuildError {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

/** The parts of an evaluator failure this projection reads. */
interface BuildFailure {
  readonly code: string;
  readonly message: string;
  readonly buildErrors?: readonly BuildError[];
}

/**
 * Builds the diagnostic of a failure whose import did not parse.
 * @param failure - Evaluator failure.
 * @returns The diagnostic at the first parse error, or undefined when the failure has none.
 */
export function buildErrorDiagnostic(failure: BuildFailure): Diagnostic | undefined {
  const [first, ...rest] = failure.buildErrors ?? [];
  if (first === undefined) return undefined;
  const further = rest.map((entry) =>
    entry.file === first.file
      ? `${entry.line}:${entry.column} ${entry.message}`
      : `${entry.file}:${entry.line}:${entry.column} ${entry.message}`,
  );
  return createDiagnostic({
    code: failure.code,
    severity: "error",
    message: further.length === 0 ? first.message : `${first.message} (also ${further.join("; ")})`,
    file: first.file,
    line: first.line,
    column: first.column,
  });
}

/**
 * Keys a failure for root-cause grouping: the message, and the first parse error's location when
 * there is one, since files importing a file that does not parse fail with its errors.
 * @param failure - Evaluator failure.
 * @returns The grouping key.
 */
export function rootCauseKey(failure: BuildFailure): string {
  const first = failure.buildErrors?.[0];
  return first === undefined
    ? failure.message
    : `${first.file}:${first.line}:${first.column}\u0000${first.message}`;
}
