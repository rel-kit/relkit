import { Effect } from "effect";
import { expect, test } from "vitest";
import {
  approveApproval,
  approveApprovalEffect,
  assertApprovalGrantedEffect,
  createApproval,
  createApprovalEffect,
  denyApprovalEffect,
  isApprovalRecordEffect,
  requiresApproval,
  requiresApprovalEffect,
} from "../src/approval.js";

const options = {
  invocationId: "run-1",
  toolCallId: "call-1",
  toolId: "send",
  sideEffect: "write",
  policy: "always",
} as const;

test("approval operations run through typed Effects and compatibility adapters", () => {
  const pending = Effect.runSync(createApprovalEffect(options));
  expect(pending).toEqual(createApproval(options));
  expect(Effect.runSync(requiresApprovalEffect("always", "write"))).toBe(true);
  expect(requiresApproval("always", "write")).toBe(true);
  expect(Effect.runSync(isApprovalRecordEffect(pending))).toBe(true);
  const approved = Effect.runSync(approveApprovalEffect(pending));
  expect(approved).toEqual(approveApproval(pending));
  Effect.runSync(assertApprovalGrantedEffect(approved));
  expect(Effect.runSync(denyApprovalEffect(pending)).state).toBe("denied");
});

test("expected validation and state errors remain typed and recoverable", () => {
  const invalid = Effect.runSync(Effect.flip(requiresApprovalEffect("invalid" as never, "write")));
  expect(invalid).toMatchObject({ _tag: "ApprovalEffectError", code: "RELKIT_APPROVAL_INVALID" });
  expect(() => requiresApproval("invalid" as never, "write")).toThrow(TypeError);
  const pending = createApproval(options);
  const denied = Effect.runSync(denyApprovalEffect(pending));
  const required = Effect.runSync(Effect.flip(assertApprovalGrantedEffect(pending)));
  const rejected = Effect.runSync(Effect.flip(assertApprovalGrantedEffect(denied)));
  expect(required.code).toBe("RELKIT_APPROVAL_REQUIRED");
  expect(rejected.code).toBe("RELKIT_APPROVAL_DENIED");
  expect(
    Effect.runSync(
      requiresApprovalEffect("invalid" as never, "write").pipe(
        Effect.catchTag("ApprovalEffectError", (error) => Effect.succeed(error.code)),
      ),
    ),
  ).toBe("RELKIT_APPROVAL_INVALID");
});
