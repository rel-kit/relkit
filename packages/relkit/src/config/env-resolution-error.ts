import { Data } from "effect";
import type { EnvIssue } from "./resolve.types.js";

/** Tagged failure containing ordered field issues.
 * @example new EnvResolutionError([{ name: "TOKEN", code: "missing", message: "Required value is missing", sensitive: true }]);
 */
export class EnvResolutionError extends Data.TaggedError("EnvResolutionError")<{
  readonly issues: readonly EnvIssue[];
  readonly message: string;
}> {
  readonly name = "EnvResolutionError";

  /** Build the aggregate while preserving its established message.
   * @param issues - Ordered invalid or missing fields.
   * @returns A tagged resolution error.
   * @example new EnvResolutionError([{ name: "PORT", code: "missing", message: "Required value is missing", sensitive: false }]);
   */
  constructor(issues: readonly EnvIssue[]) {
    super({
      issues: Object.freeze([...issues]),
      message: issues.map((issue) => `${issue.name}: ${issue.message}`).join("; "),
    });
  }
}
