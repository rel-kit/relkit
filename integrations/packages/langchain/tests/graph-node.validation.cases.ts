/** Creates isolated native graph node fixtures; each caller owns the returned model, state and provider observations. */
import { expect } from "vitest";
import { Command, END, Send } from "@langchain/langgraph";

import { assertGraphNodeDestinations, defineGraphNode } from "../src/index.js";
import { input, output } from "./graph-node.fixture.js";

export async function caseRejectsInvalidInputAndOrdinaryOrCommand() {
  const invalidInput = defineGraphNode({
    id: "input",
    input,
    output,
    handler: () => ({ approved: true }),
  });
  const invalidOutput = defineGraphNode({
    id: "output",
    input,
    output,
    handler: () => ({ approved: "yes" as unknown as boolean }),
  });
  const invalidCommand = defineGraphNode({
    id: "command",
    input,
    output,
    handler: () => new Command({ update: { approved: "yes" as unknown as boolean } }),
  });
  await expect(
    invalidInput.handler({ summary: 42 } as unknown as {
      summary: string;
    }),
  ).rejects.toThrow("Graph node input validation failed: Expected a string");
  await expect(invalidOutput.handler({ summary: "safe" })).rejects.toThrow(
    "Graph node output validation failed: Expected boolean",
  );
  await expect(invalidCommand.handler({ summary: "safe" })).rejects.toThrow(
    "Graph node output validation failed: Expected boolean",
  );
}

export async function caseRejectsUndeclaredStringAndSendDestinationsAt() {
  const stringNode = defineGraphNode({
    id: "review",
    input,
    output,
    ends: ["approve"] as const,
    handler: async () => new Command({ update: { approved: false }, goto: "reject" as "approve" }),
  });
  const sendNode = defineGraphNode({
    id: "fanout",
    input,
    output,
    ends: ["worker"] as const,
    handler: async () =>
      new Command({
        update: { approved: true },
        goto: new Send("missing" as "worker", { summary: "safe" }),
      }),
  });
  await expect(stringNode.handler({ summary: "unsafe" })).rejects.toThrow(
    'Graph node command destination "reject" is not declared in ends',
  );
  await expect(sendNode.handler({ summary: "safe" })).rejects.toThrow(
    'Graph node command destination "missing" is not declared in ends',
  );
}

export function caseRejectsStaleEndsAndInvalidDeclarations() {
  const node = defineGraphNode({
    id: "review",
    input,
    output,
    ends: ["approve", END] as const,
    handler: () => ({ approved: true }),
  });
  expect(() => assertGraphNodeDestinations(node, ["review"])).toThrow(
    'Graph node "review" declares unknown destination "approve"',
  );
  expect(() =>
    defineGraphNode({
      id: "review",
      input,
      output,
      ends: ["approve", "approve"],
      handler: () => ({ approved: true }),
    }),
  ).toThrow("Graph node ends must be unique");
}
