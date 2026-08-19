import { describe, expect, test } from "bun:test";
import {
  createModelCapabilities,
  createModelRequest,
  createModelTurn,
  ModelContractError,
} from "./src/index.ts";

describe("model provider contracts", () => {
  test("normalizes logical profiles and bounds request content", () => {
    const request = createModelRequest({
      profile: " default ",
      messages: [{ role: "user", content: { question: "ready" } }],
      maxInputBytes: 128,
      maxOutputBytes: 64,
    });

    expect(request.profile).toBe("default");
    expect(request.inputBytes).toBeGreaterThan(0);
    expect(Object.isFrozen(request)).toBe(true);
    expect(() =>
      createModelRequest({
        profile: "default",
        messages: [{ role: "user", content: "too long" }],
        maxInputBytes: 1,
        maxOutputBytes: 64,
      }),
    ).toThrow(ModelContractError);
  });

  test("keeps capabilities and turns vendor-neutral and bounded", () => {
    const capabilities = createModelCapabilities({
      toolCalls: true,
      cancellation: true,
      maxInputBytes: 256,
      maxOutputBytes: 64,
    });
    const turn = createModelTurn(
      { type: "tool-call", callId: "call-1", toolId: "orders.get.tool", input: { id: "1" } },
      capabilities.maxOutputBytes,
    );

    expect(capabilities).toEqual({
      toolCalls: true,
      cancellation: true,
      maxInputBytes: 256,
      maxOutputBytes: 64,
    });
    expect(turn).toMatchObject({ type: "tool-call", toolId: "orders.get.tool" });
    expect(Object.isFrozen(turn)).toBe(true);
    expect(() => createModelTurn({ type: "final", output: "x".repeat(65) }, 64)).toThrow(
      ModelContractError,
    );
  });
});
