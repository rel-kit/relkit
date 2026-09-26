import {
  FunctionToolArgumentValidationError as ToolArgumentValidationError,
  FunctionToolOperationCancelledError as ToolOperationCancelledError,
} from "@relkit/functions";
import { Schema } from "effect";

/** Compatibility error for a tool ID absent from the registered source.
 * @example throw new ToolUnknownError("orders.missing");
 */
export class ToolUnknownError extends TypeError {
  readonly code = "RELKIT_TOOL_UNKNOWN" as const;
  /** @param toolId - Missing canonical tool ID. */
  constructor(readonly toolId: string) {
    super(`Tool "${toolId}" is not registered`);
    this.name = "ToolUnknownError";
  }
}

/** Compatibility error for a registered tool excluded by policy.
 * @example throw new ToolNotAllowedError("orders.delete");
 */
export class ToolNotAllowedError extends TypeError {
  readonly code = "RELKIT_TOOL_NOT_ALLOWED" as const;
  /** @param toolId - Disallowed canonical tool ID. */
  constructor(readonly toolId: string) {
    super(`Tool "${toolId}" is not allowed for this invocation`);
    this.name = "ToolNotAllowedError";
  }
}

/** Tagged Effect failure for an unknown registered tool.
 * @example Effect.catchTag(invokeToolEffect(request), "ToolUnknownFailure", () => Effect.void);
 */
export class ToolUnknownFailure extends Schema.TaggedError<ToolUnknownFailure>()(
  "ToolUnknownFailure",
  { toolId: Schema.String, cause: Schema.Defect() },
) {}

/** Tagged Effect failure for a tool excluded by the allowlist.
 * @example Effect.catchTag(invokeToolEffect(request), "ToolNotAllowedFailure", () => Effect.void);
 */
export class ToolNotAllowedFailure extends Schema.TaggedError<ToolNotAllowedFailure>()(
  "ToolNotAllowedFailure",
  { toolId: Schema.String, cause: Schema.Defect() },
) {}

/** Tagged Effect failure for malformed JSON or schema validation.
 * @example Effect.catchTag(invokeToolEffect(request), "ToolArgumentsFailure", () => Effect.void);
 */
export class ToolArgumentsFailure extends Schema.TaggedError<ToolArgumentsFailure>()(
  "ToolArgumentsFailure",
  { cause: Schema.Defect() },
) {}

/** Tagged Effect failure for cancellation before engine dispatch.
 * @example Effect.catchTag(invokeToolEffect(request), "ToolCancelledFailure", () => Effect.void);
 */
export class ToolCancelledFailure extends Schema.TaggedError<ToolCancelledFailure>()(
  "ToolCancelledFailure",
  { cause: Schema.Defect() },
) {}

/** Tagged Effect failure from the common engine boundary.
 * @example Effect.catchTag(invokeToolEffect(request), "ToolEngineFailure", () => Effect.void);
 */
export class ToolEngineFailure extends Schema.TaggedError<ToolEngineFailure>()(
  "ToolEngineFailure",
  { cause: Schema.Defect() },
) {}

export { ToolArgumentValidationError, ToolOperationCancelledError };
