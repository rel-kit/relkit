import { Schema } from "effect";

/** Tagged Effect failure for malformed tool arguments.
 * @example Effect.catchTag(invokeFunctionToolEffect(target, metadata, input), "FunctionToolArgumentFailure", () => Effect.void);
 */
export class FunctionToolArgumentFailure extends Schema.TaggedError<FunctionToolArgumentFailure>()(
  "FunctionToolArgumentFailure",
  {
    issues: Schema.Array(Schema.Struct({ message: Schema.String })),
    cause: Schema.Defect(),
  },
) {}

/** Tagged Effect failure when tool execution is cancelled.
 * @example Effect.catchTag(invokeFunctionToolEffect(target, metadata, input), "FunctionToolCancelledFailure", () => Effect.void);
 */
export class FunctionToolCancelledFailure extends Schema.TaggedError<FunctionToolCancelledFailure>()(
  "FunctionToolCancelledFailure",
  { cause: Schema.Defect() },
) {}

/** Tagged Effect failure when a tool needs an approval resolver.
 * @example Effect.catchTag(invokeFunctionToolEffect(target, metadata, input), "FunctionToolApprovalRequiredFailure", () => Effect.void);
 */
export class FunctionToolApprovalRequiredFailure extends Schema.TaggedError<FunctionToolApprovalRequiredFailure>()(
  "FunctionToolApprovalRequiredFailure",
  {
    approval: Schema.Struct({
      toolId: Schema.String,
      sideEffect: Schema.Literals(["none", "read", "write", "external"]),
      policy: Schema.Literals(["never", "on-write", "always"]),
    }),
    cause: Schema.Defect(),
  },
) {}

/** Tagged Effect failure when approval is denied.
 * @example Effect.catchTag(invokeFunctionToolEffect(target, metadata, input), "FunctionToolApprovalDeniedFailure", () => Effect.void);
 */
export class FunctionToolApprovalDeniedFailure extends Schema.TaggedError<FunctionToolApprovalDeniedFailure>()(
  "FunctionToolApprovalDeniedFailure",
  {
    approval: Schema.Struct({
      toolId: Schema.String,
      sideEffect: Schema.Literals(["none", "read", "write", "external"]),
      policy: Schema.Literals(["never", "on-write", "always"]),
    }),
    cause: Schema.Defect(),
  },
) {}
