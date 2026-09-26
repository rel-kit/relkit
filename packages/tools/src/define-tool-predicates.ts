import { isDescriptor, isRef } from "@relkit/contracts";
import { Effect } from "effect";
import { observeTool, runToolSync, ToolOperationFailure } from "./tool-observability.js";
import {
  isFunctionTargetEffect,
  isNonEmptyStringEffect,
  isPositiveIntegerEffect,
  isRecordEffect,
  isToolApprovalEffect,
  isToolSideEffectEffect,
} from "./tool-predicates.js";
import type { ToolDescriptor, ToolRefAny } from "./define-tool.types.js";

/** Checks a descriptor through Effect.
 * @param value - Candidate descriptor.
 * @returns Whether it is a valid tool descriptor; never fails.
 * @example Effect.runSync(isToolDescriptorEffect(tool));
 */
export const isToolDescriptorEffect = Effect.fn("tools.is-descriptor")((value: unknown) =>
  observeTool(
    "is-descriptor",
    Effect.gen(function* () {
      if (!(yield* isRecordEffect(value))) return false;
      const descriptor = value as Record<PropertyKey, unknown>;
      if (Object.prototype.hasOwnProperty.call(value, "handler") || !isDescriptor(value, "tool"))
        return false;
      if (!(yield* isFunctionTargetEffect(descriptor.target))) return false;
      if (typeof descriptor.invoke !== "function") return false;
      if (!(yield* isNonEmptyStringEffect(descriptor.description))) return false;
      if (!(yield* isToolSideEffectEffect(descriptor.sideEffect))) return false;
      if (!(yield* isToolApprovalEffect(descriptor.approval))) return false;
      if (typeof descriptor.mcp !== "boolean") return false;
      return (
        descriptor.timeoutMs === undefined || (yield* isPositiveIntegerEffect(descriptor.timeoutMs))
      );
    }),
  ),
);

/** Checks a descriptor.
 * @param value - Candidate descriptor.
 * @returns Whether it is a valid tool descriptor.
 * @example if (isToolDescriptor(value)) await value.invoke({});
 */
export function isToolDescriptor(value: unknown): value is ToolDescriptor<string> {
  return runToolSync(isToolDescriptorEffect(value));
}

/** Asserts a tool descriptor through Effect.
 * @param value - Candidate descriptor.
 * @returns Descriptor or tagged input failure.
 * @example Effect.runSync(assertToolDescriptorEffect(tool));
 */
export const assertToolDescriptorEffect = Effect.fn("tools.assert-descriptor")((value: unknown) =>
  observeTool(
    "assert-descriptor",
    Effect.gen(function* () {
      if (!(yield* isToolDescriptorEffect(value))) {
        return yield* Effect.fail(
          new ToolOperationFailure({
            operation: "assert-descriptor",
            reason: "Invalid tool descriptor",
            cause: new TypeError("Invalid tool descriptor"),
          }),
        );
      }
      return value as ToolDescriptor<string>;
    }),
  ),
);

/** Asserts a tool descriptor.
 * @param value - Candidate descriptor.
 * @returns Nothing when valid.
 * @throws TypeError when the value is not a tool descriptor.
 * @example assertToolDescriptor(value);
 */
export function assertToolDescriptor(value: unknown): asserts value is ToolDescriptor<string> {
  runToolSync(assertToolDescriptorEffect(value));
}

/** Checks a tool reference through Effect.
 * @param value - Candidate reference.
 * @returns Whether it is a tool reference; never fails.
 * @example Effect.runSync(isToolRefEffect({ ref: { kind: "tool", id: "orders.lookup" } }));
 */
export const isToolRefEffect = Effect.fn("tools.is-ref")((value: unknown) =>
  observeTool(
    "is-ref",
    Effect.gen(function* () {
      if (!(yield* isRecordEffect(value))) return false;
      return isRef((value as Record<PropertyKey, unknown>).ref, "tool");
    }),
  ),
);

/** Checks a tool reference.
 * @param value - Candidate reference.
 * @returns Whether it is a tool reference.
 * @example isToolRef({ ref: { kind: "tool", id: "orders.lookup" } });
 */
export function isToolRef(value: unknown): value is ToolRefAny {
  return runToolSync(isToolRefEffect(value));
}
