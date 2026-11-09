/** Asserts the public waiting contract and validates native approval/edit payloads. */
import { expect } from "vitest";
import { validateNativeAgentResumeInput } from "@relkit/langchain";
import { type waitForStatus } from "./deepagent-resume.fixture.js";

export function assertDeepWaiting(waiting: Awaited<ReturnType<typeof waitForStatus>>) {
  expect(waiting.waiting.requests[0]).toMatchObject({
    value: {
      actionRequests: [{ name: "danger", args: { value: "approved" } }],
      reviewConfigs: [{ actionName: "danger", allowedDecisions: ["approve", "edit", "reject"] }],
    },
    response: { type: "object", required: ["decisions"] },
  });
  expect(waiting.waiting.requests[0]).not.toHaveProperty("id");
  expect(JSON.stringify(waiting.waiting)).not.toContain("__interrupt__");
  expect(
    validateNativeAgentResumeInput(waiting.waiting.requests, {
      decisions: [{ type: "approve" }],
    }),
  ).toEqual({ decisions: [{ type: "approve" }] });
  expect(() =>
    validateNativeAgentResumeInput(waiting.waiting.requests, {
      decisions: [{ type: "edit", editedAction: { name: "danger", args: {} } }],
    }),
  ).toThrow("arguments are invalid");
  expect(() =>
    validateNativeAgentResumeInput(waiting.waiting.requests, {
      decisions: [{ type: "edit", editedAction: { name: "other", args: { value: "x" } } }],
    }),
  ).toThrow("edited action is invalid");
}
