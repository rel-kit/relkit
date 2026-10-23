/** Exercises native graph node behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

import { describe, expect, expectTypeOf, test } from "vitest";
import { Command, END, Send, interrupt } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import {
  assertGraphNodeDestinations,
  defineGraphNode,
  isGraphNodeDescriptor,
} from "../src/index.js";
import { input, output } from "./graph-node.fixture.js";
import {
  caseRejectsInvalidInputAndOrdinaryOrCommand,
  caseRejectsUndeclaredStringAndSendDestinationsAt,
  caseRejectsStaleEndsAndInvalidDeclarations,
} from "./graph-node.validation.cases.js";

describe("defineGraphNode", () => {
  test(
    "keeps typed schemas, resume input, and native control values",
    caseKeepsTypedSchemasResumeInputAndNative,
  );

  test(
    "projects graph state input and ordinary partial updates",
    caseProjectsGraphStateInputAndOrdinaryPartial,
  );

  test(
    "projects Command updates without replacing the native command",
    caseProjectsCommandUpdatesWithoutReplacingTheNative,
  );

  test(
    "rejects invalid input and ordinary or Command updates",
    caseRejectsInvalidInputAndOrdinaryOrCommand,
  );

  test(
    "rejects undeclared string and Send destinations at runtime",
    caseRejectsUndeclaredStringAndSendDestinationsAt,
  );

  test("rejects stale ends and invalid declarations", caseRejectsStaleEndsAndInvalidDeclarations);
});

if (false) {
  defineGraphNode({
    id: "invalid-destination",
    input,
    output,
    ends: ["approve"] as const,
    // @ts-expect-error Command destinations are restricted to declared ends.
    handler: () => new Command({ update: { approved: true }, goto: "missing" }),
  });

  defineGraphNode({
    id: "invalid-update",
    input,
    output,
    // @ts-expect-error Graph nodes return object-shaped partial state updates.
    handler: () => "approved",
  });
}

/** Verifies that keeps typed schemas, resume input, and native control values.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseKeepsTypedSchemasResumeInputAndNative() {
  const command = new Command({
    update: { approved: true },
    goto: "approve" as const,
  });
  const node = defineGraphNode({
    id: "review",
    input,
    output,
    resume: z.boolean(),
    ends: ["approve", "reject"] as const,
    handler: ({ summary }) =>
      summary.length > 0
        ? command
        : new Command({ update: { approved: false }, goto: "reject" as const }),
  });
  expect(isGraphNodeDescriptor(node)).toBe(true);
  expect(Object.isFrozen(node)).toBe(true);
  expect(Object.isFrozen(node.ends)).toBe(true);
  expectTypeOf(node.resume).toEqualTypeOf<ReturnType<typeof z.boolean> | undefined>();
  const inferredInput: Parameters<typeof node.handler>[0] = { summary: "safe" };
  const expectedInput: {
    summary: string;
  } = inferredInput;
  const result = await node.handler(expectedInput);
  expect(result).toBe(command);
  expect((result as Command).goto).toEqual(["approve"]);
  const paused = defineGraphNode({
    id: "pause",
    input,
    output,
    resume: z.string(),
    handler: () => interrupt("pause"),
  });
  await expect(Promise.resolve(paused.handler(inferredInput))).rejects.toThrow(
    "Called interrupt() outside the context of a graph",
  );
}

/** Verifies that projects graph state input and ordinary partial updates.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseProjectsGraphStateInputAndOrdinaryPartial() {
  let received: unknown;
  const node = defineGraphNode({
    id: "approve",
    input,
    output,
    handler: (state) => {
      received = state;
      return { approved: true, privateValue: "hidden" };
    },
  });
  const fullState = { summary: "safe", privateValue: "hidden" };
  expect(await node.handler(fullState)).toEqual({ approved: true });
  expect(received).toEqual({ summary: "safe" });
}

/** Verifies that projects Command updates without replacing the native command.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseProjectsCommandUpdatesWithoutReplacingTheNative() {
  const command = new Command({
    update: { approved: true, privateValue: "hidden" },
    goto: "approve" as const,
  });
  const node = defineGraphNode({
    id: "review",
    input,
    output,
    ends: ["approve"] as const,
    handler: () => command,
  });
  expect(await node.handler({ summary: "safe" })).toBe(command);
  expect(JSON.stringify(command.update)).toBe('{"approved":true}');
}
