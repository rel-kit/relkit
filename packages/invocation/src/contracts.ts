import type { StandardIssue } from "@relkit/schema";
import { Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";

export type * from "./contracts.types.js";

/** Public input or output schema validation error with frozen issue data.
 * @example new InvocationValidationError("input", issues);
 */
export class InvocationValidationError extends TypeError {
  readonly code: "RELKIT_INPUT_VALIDATION" | "RELKIT_OUTPUT_VALIDATION";
  readonly phase: "input" | "output";
  readonly issues: readonly StandardIssue[];

  constructor(phase: "input" | "output", issues: readonly StandardIssue[]) {
    super(`${phase === "input" ? "Input" : "Output"} validation failed`);
    this.name = "InvocationValidationError";
    this.code = phase === "input" ? "RELKIT_INPUT_VALIDATION" : "RELKIT_OUTPUT_VALIDATION";
    this.phase = phase;
    this.issues = runInvocationSync(
      observeInvocation(
        "validation.error-create",
        Effect.sync(() => Object.freeze(issues.map((issue) => Object.freeze({ ...issue })))),
      ),
    );
  }
}

/** Constructs a public validation error through Effect.
 * @param phase - Input or output phase.
 * @param issues - Standard Schema issues.
 * @returns Frozen validation error; malformed issue objects remain defects.
 * @example Effect.runSync(makeInvocationValidationErrorEffect("input", issues));
 */
export function makeInvocationValidationErrorEffect(
  phase: "input" | "output",
  issues: readonly StandardIssue[],
): Effect.Effect<InvocationValidationError> {
  return observeInvocation(
    "validation.error-factory",
    Effect.sync(() => new InvocationValidationError(phase, issues)),
  );
}
