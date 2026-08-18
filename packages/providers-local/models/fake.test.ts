import { describe, expect, test } from "bun:test";
import { createModelRequest } from "@zsys/agents";
import { createFakeModelProvider, FakeModelError, type FakeModelRequest } from "../src/index.ts";

const request = (signal?: AbortSignal): ReturnType<typeof createModelRequest> =>
  createModelRequest({
    profile: "default",
    messages: [{ role: "user", content: { question: "status" } }],
    maxInputBytes: 4_096,
    maxOutputBytes: 512,
    ...(signal === undefined ? {} : { signal }),
  });

describe("fake model provider", () => {
  test("returns every scripted turn and records deterministic calls", async () => {
    const fake = createFakeModelProvider({
      script: [
        { type: "tool-call", callId: "call-1", toolId: "orders.get.tool", input: { id: "1" } },
        { type: "final", output: { answer: "ready" } },
        { type: "error", code: "MODEL_BUSY", message: "retry later" },
        { type: "cancelled", reason: "test-cancel" },
      ],
    });

    await expect(fake.request(request())).resolves.toMatchObject({ type: "tool-call" });
    await expect(fake.request(request())).resolves.toEqual({
      type: "final",
      output: { answer: "ready" },
    });
    await expect(fake.request(request())).resolves.toEqual({
      type: "error",
      code: "MODEL_BUSY",
      message: "retry later",
    });
    await expect(fake.request(request())).resolves.toEqual({
      type: "cancelled",
      reason: "test-cancel",
    });

    const calls = fake.inspect();
    expect(calls).toHaveLength(4);
    expect(calls.map(({ index, turn }) => [index, turn.type])).toEqual([
      [0, "tool-call"],
      [1, "final"],
      [2, "error"],
      [3, "cancelled"],
    ]);
    expect(calls[0]?.request).toMatchObject({ profile: "default", inputBytes: expect.any(Number) });
    expect("signal" in (calls[0]?.request as FakeModelRequest)).toBe(false);
    expect(Object.isFrozen(calls)).toBe(true);
  });

  test("honors cancellation, resets scripts, and never falls back to a network model", async () => {
    const fake = createFakeModelProvider({ script: [{ type: "final", output: { answer: "ok" } }] });
    const controller = new AbortController();
    controller.abort();

    await expect(fake.request(request(controller.signal))).resolves.toEqual({
      type: "cancelled",
      reason: "request-cancelled",
    });
    expect(fake.inspect()).toHaveLength(1);

    fake.script([{ type: "final", output: { answer: "reset" } }]);
    await expect(fake.request(request())).resolves.toEqual({
      type: "final",
      output: { answer: "reset" },
    });
    expect(fake.calls).toHaveLength(1);
    await expect(fake.request(request())).rejects.toMatchObject({
      code: "ZSYS_FAKE_MODEL_SCRIPT_EXHAUSTED",
    } satisfies Partial<FakeModelError>);
  });
});
