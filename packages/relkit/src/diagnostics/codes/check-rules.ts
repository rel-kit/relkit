/** Codes reported by the opt-in `relkit check` rules in `check` configuration. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const checkRuleCodes = [
  {
    code: "RELKIT_FUNCTION_ERROR_UNUSED",
    title: "Function declares an error it never raises",
    happened:
      "The opt-in `check.unusedErrors` rule is on, and a function lists an error in `errors` that its handler never throws or returns. The rule only looks inside the handler, so an error raised from a helper function also counts as unused.",
    fix: "Throw or return the error from the handler, or remove it from the function's `errors`.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
