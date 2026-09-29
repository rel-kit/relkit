import { expect, test } from "vitest";
import { Effect } from "effect";
import { agentProcedureEntriesFromDocumentEffect } from "../src/generate-agent-procedures.js";
import { agentResumeTypeEffect } from "../src/generate-agent-resume.js";
import { controlInputsEffect } from "../src/generate-agent-procedure-fragments.js";
test("renders every control payload and tolerates unknown documented controls", () => {
  const entries = Effect.runSync(
    agentProcedureEntriesFromDocumentEffect([
      null,
      { id: 1, input: {} },
      {
        id: "assistant",
        input: { type: "string" },
        controls: ["steer", "follow-up", "stop", "approve", "custom", 1],
        workflow: { nodes: [{ resume: { type: "boolean" }, workflow: { nodes: [] } }] },
      },
    ]),
  );
  const text = entries.join("\n");
  expect(text).toContain('readonly kind: "steer"; readonly payload: string');
  expect(text).toContain('readonly kind: "stop"; readonly payload: { readonly mode?');
  expect(text).toContain('readonly kind: "approve"; readonly payload: { readonly approvalId');
  expect(text).toContain('readonly kind: "custom"; readonly payload: unknown');
  expect(text).toContain("readonly resume: true");
  expect(
    Effect.runSync(agentResumeTypeEffect({ nodes: [null, { resume: { type: "string" } }] })),
  ).toBe("string");
});
test("control inputs compose as an Effect and preserve declared order", () => {
  const inputs = Effect.runSync(
    controlInputsEffect({
      id: "assistant",
      input: {},
      controls: ["stop", 1, "custom", "approve"],
    }),
  );
  expect(inputs).toHaveLength(3);
  expect(inputs[0]).toContain('readonly kind: "stop"');
  expect(inputs[1]).toContain('readonly kind: "custom"');
  expect(inputs[2]).toContain('readonly kind: "approve"');
  expect(
    Effect.runSync(controlInputsEffect({ id: "assistant", input: {}, controls: null })),
  ).toEqual([]);
});
