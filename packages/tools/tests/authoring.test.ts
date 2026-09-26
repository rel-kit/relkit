import { describe, expect, test } from "vitest";
import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { Cause, Effect, Exit, Layer } from "effect";
import {
  assertToolDescriptor,
  assertToolDescriptorEffect,
  defineTool,
  defineToolEffect,
  isToolDescriptor,
  isToolDescriptorEffect,
  isToolRef,
  isToolRefEffect,
} from "../src/define-tool.js";
import {
  copyFunctionTarget,
  copyFunctionTargetEffect,
  positiveInteger,
  positiveIntegerEffect,
  requiredText,
  requiredTextEffect,
  validateApproval,
  validateApprovalEffect,
  validateSideEffect,
  validateSideEffectEffect,
} from "../src/define-tool-validation.js";
import {
  hasOwn,
  hasOwnEffect,
  isFunctionTarget,
  isFunctionTargetEffect,
  isNonEmptyString,
  isNonEmptyStringEffect,
  isPositiveInteger,
  isPositiveIntegerEffect,
  isRecord,
  isRecordEffect,
  isToolApproval,
  isToolApprovalEffect,
  isToolSideEffect,
  isToolSideEffectEffect,
} from "../src/tool-predicates.js";
import { ToolOperationFailure, ToolTelemetry } from "../src/tool-observability.js";

const target = defineFunction({
  id: "orders.lookup",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: ({ id }) => ({ id }),
});
const options = {
  id: "orders.lookup.tool",
  target,
  description: " Look up order ",
  sideEffect: "read" as const,
  approval: "never" as const,
  timeoutMs: 10,
};

describe("tool authoring", () => {
  test("Effect construction and adapter preserve frozen metadata and shape", () => {
    const effectTool = Effect.runSync(defineToolEffect(options));
    const adapterTool = defineTool(options);
    expect(effectTool.description).toBe("Look up order");
    expect(adapterTool.target.ref).toEqual({ kind: "function", id: "orders.lookup" });
    expect(Object.isFrozen(adapterTool)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(adapterTool, "invoke")?.enumerable).toBe(false);
    expect(isToolDescriptor(adapterTool)).toBe(true);
    expect(Effect.runSync(isToolDescriptorEffect(adapterTool))).toBe(true);
    expect(isToolRef(adapterTool)).toBe(true);
    expect(Effect.runSync(isToolRefEffect(adapterTool))).toBe(true);
    assertToolDescriptor(adapterTool);
    expect(Effect.runSync(assertToolDescriptorEffect(adapterTool))).toBe(adapterTool);
    expect(copyFunctionTarget(target).ref.id).toBe("orders.lookup");
    expect(Effect.runSync(copyFunctionTargetEffect(target)).input).toBe(target.input);
  });

  test("invalid authoring is tagged in Effect and preserves TypeError in adapter", () => {
    expect(() => defineTool({ ...options, target: {} as never })).toThrow(
      "Tool target must be a function reference",
    );
    expect(() => defineTool({ ...options, description: " " })).toThrow(
      "Tool description is required",
    );
    expect(() => defineTool({ ...options, sideEffect: "execute" as never })).toThrow(
      "Tool sideEffect must be",
    );
    expect(() => defineTool({ ...options, approval: "ask" as never })).toThrow(
      "Tool approval must be",
    );
    expect(() => defineTool({ ...options, timeoutMs: 0 })).toThrow(
      "timeoutMs must be a positive integer",
    );
    expect(() => defineTool({ ...options, handler: () => null } as never)).toThrow(
      "Tools cannot own handlers",
    );
    const exit = Effect.runSyncExit(defineToolEffect({ ...options, target: {} as never }));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(ToolOperationFailure);
    expect(isToolDescriptor({})).toBe(false);
    expect(isToolRef({ ref: { kind: "function", id: "orders.lookup" } })).toBe(false);
    expect(() => assertToolDescriptor({})).toThrow("Invalid tool descriptor");
    const assertion = Effect.runSyncExit(assertToolDescriptorEffect({}));
    if (Exit.isFailure(assertion))
      expect(Cause.squash(assertion.cause)).toBeInstanceOf(ToolOperationFailure);
  });

  test("every value helper has an Effect path and compatibility adapter", () => {
    expect(validateSideEffect("read")).toBe("read");
    expect(Effect.runSync(validateSideEffectEffect("external"))).toBe("external");
    expect(validateApproval("never")).toBe("never");
    expect(Effect.runSync(validateApprovalEffect("always"))).toBe("always");
    expect(requiredText(" yes ", "name")).toBe("yes");
    expect(Effect.runSync(requiredTextEffect(" yes ", "name"))).toBe("yes");
    positiveInteger(1, "limit");
    expect(Effect.runSync(positiveIntegerEffect(2, "limit"))).toBe(2);
    expect(() => validateSideEffect("bad")).toThrow(TypeError);
    expect(() => validateApproval("bad")).toThrow(TypeError);
    expect(() => requiredText(" ", "name")).toThrow(TypeError);
    expect(() => positiveInteger(0, "limit")).toThrow(TypeError);
    expect(isToolSideEffect("read")).toBe(Effect.runSync(isToolSideEffectEffect("read")));
    expect(isToolApproval("never")).toBe(Effect.runSync(isToolApprovalEffect("never")));
    expect(isPositiveInteger(1)).toBe(Effect.runSync(isPositiveIntegerEffect(1)));
    expect(isNonEmptyString("x")).toBe(Effect.runSync(isNonEmptyStringEffect("x")));
    expect(isRecord({})).toBe(Effect.runSync(isRecordEffect({})));
    expect(hasOwn({ x: 1 }, "x")).toBe(Effect.runSync(hasOwnEffect({ x: 1 }, "x")));
    expect(isFunctionTarget(target)).toBe(Effect.runSync(isFunctionTargetEffect(target)));
    expect(isFunctionTarget({})).toBe(false);
  });

  test("telemetry service can observe success and tagged failure", () => {
    const seen: string[] = [];
    const telemetry = Layer.succeed(ToolTelemetry, {
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    });
    Effect.runSync(Effect.provide(validateApprovalEffect("never"), telemetry));
    Effect.runSyncExit(Effect.provide(validateApprovalEffect("bad"), telemetry));
    expect(seen).toEqual(["is-approval", "validate-approval", "is-approval", "validate-approval"]);
  });

  test("nested Effect predicates retain the supplied telemetry Layer", () => {
    const seen: string[] = [];
    const telemetry = Layer.succeed(ToolTelemetry, {
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    });
    const descriptor = Effect.runSync(Effect.provide(defineToolEffect(options), telemetry));
    Effect.runSync(Effect.provide(isToolDescriptorEffect(descriptor), telemetry));
    Effect.runSync(Effect.provide(isToolRefEffect(descriptor), telemetry));
    expect(seen).toEqual(
      expect.arrayContaining([
        "is-record",
        "is-function-target",
        "is-side-effect",
        "is-approval",
        "is-positive-integer",
        "is-non-empty-string",
      ]),
    );
  });
});
