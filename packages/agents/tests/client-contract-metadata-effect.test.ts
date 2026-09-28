import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  agentClientContractMetadata,
  agentClientContractMetadataEffect,
  graphClientContractMetadataEffect,
} from "../src/client-contract-metadata.js";

test("client metadata Effects retain nested scopes and adapter output", () => {
  const options = { id: "root", tools: [], middleware: [], subagents: [{ id: "child" }] };
  const metadata = Effect.runSync(agentClientContractMetadataEffect(options));
  expect(metadata.scopes).toEqual([
    { kind: "agent", id: "root" }, { kind: "subagent", id: "child" }, { kind: "dynamic" },
  ]);
  expect(metadata).toEqual(agentClientContractMetadata(options));
});

test("graph client metadata Effect tags schema projection failures", () => {
  const failure = Effect.runSync(Effect.result(graphClientContractMetadataEffect({
    id: "graph", state: { getJsonSchema: () => { throw new Error("invalid state"); } },
    workflow: { nodes: [] } as never,
  })));
  expect(Result.isFailure(failure)).toBe(true);
  if (Result.isFailure(failure)) expect(failure.failure._tag).toBe("GraphDefinitionFailure");
});
