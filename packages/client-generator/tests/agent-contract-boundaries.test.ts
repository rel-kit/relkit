import { expect, test } from "vitest";
import { Effect } from "effect";
import type { AgentContractSource } from "../src/generate-agent-contract-types.types.js";
import { agentContractTypeEffect } from "../src/generate-agent-contract-types.js";
import { agentProcedureEntriesFromDocumentEffect } from "../src/generate-agent-procedures.js";

test("renders dynamic agent metadata, chat, and empty control variants", () => {
  const agent = {
    id: "assistant",
    input: { type: "string" },
    output: { type: "string" },
    controls: "invalid",
    chat: {},
    clientContract: {
      tools: [{ kind: "dynamic" }],
      state: [],
      events: [{ kind: "dynamic" }],
      scopes: [{ kind: "dynamic" }],
      waiting: [{ scope: { kind: "dynamic" }, response: { kind: "dynamic" } }],
    },
  } as unknown as AgentContractSource;
  const rendered = Effect.runSync(agentContractTypeEffect(agent));
  expect(rendered).toContain("never, true");
  expect(rendered).toContain("ClientAgentDynamic");
  expect(rendered).toContain("Readonly<Record<never, never>>");
  expect(rendered).toContain("readonly node: string");
});

test("handles agent documents without workflow or controls", () => {
  expect(Effect.runSync(agentProcedureEntriesFromDocumentEffect(null))).toEqual([]);
  const entries = Effect.runSync(
    agentProcedureEntriesFromDocumentEffect([
      { id: "assistant", input: { type: "string" }, controls: [], chat: {} },
    ]),
  );
  const text = entries.join("\n");
  expect(text).toContain('readonly agentId: "assistant"');
  expect(text).toContain("readonly payload: string | string");
  expect(text).not.toContain("readonly resume: true");
  const noControls = Effect.runSync(
    agentProcedureEntriesFromDocumentEffect([{ id: "assistant", input: {} }]),
  );
  expect(noControls.join("\n")).toContain('readonly agentId: "assistant"');
  const state = Effect.runSync(
    agentContractTypeEffect({
      input: {},
      output: {},
      controls: [],
      clientContract: {
        waiting: [],
        state: [
          { name: "status", optional: false, schema: { type: "string" } },
          { name: "note", optional: true, schema: { type: "string" } },
        ],
      },
    } as unknown as AgentContractSource),
  );
  expect(state).toContain('readonly "status": string');
  expect(state).toContain('readonly "note"?: string');
});
