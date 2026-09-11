import { describe, expect, expectTypeOf, test } from "bun:test";
import { Command, END, Send, interrupt } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import {
  assertGraphNodeDestinations,
  defineGraphNode,
  isGraphNodeDescriptor,
} from "./src/index.js";

const input = z.object({ summary: z.string() });
const output = z.object({ approved: z.boolean() });

describe("defineGraphNode", () => {
  test("keeps typed schemas, resume input, and native control values", async () => {
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
    const expectedInput: { summary: string } = inferredInput;

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
  });

  test("projects graph state input and ordinary partial updates", async () => {
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
  });

  test("projects Command updates without replacing the native command", async () => {
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
  });

  test("rejects invalid input and ordinary or Command updates", async () => {
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
      invalidInput.handler({ summary: 42 } as unknown as { summary: string }),
    ).rejects.toThrow("Graph node input validation failed: Expected a string");
    await expect(invalidOutput.handler({ summary: "safe" })).rejects.toThrow(
      "Graph node output validation failed: Expected boolean",
    );
    await expect(invalidCommand.handler({ summary: "safe" })).rejects.toThrow(
      "Graph node output validation failed: Expected boolean",
    );
  });

  test("rejects undeclared string and Send destinations at runtime", async () => {
    const stringNode = defineGraphNode({
      id: "review",
      input,
      output,
      ends: ["approve"] as const,
      handler: async () =>
        new Command({ update: { approved: false }, goto: "reject" as "approve" }),
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

    expect(stringNode.handler({ summary: "unsafe" })).rejects.toThrow(
      'Graph node command destination "reject" is not declared in ends',
    );
    expect(sendNode.handler({ summary: "safe" })).rejects.toThrow(
      'Graph node command destination "missing" is not declared in ends',
    );
  });

  test("rejects stale ends and invalid declarations", () => {
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
  });
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
