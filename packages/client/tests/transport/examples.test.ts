import { expect, it } from "vitest";
import { createClientTransport } from "../../src/transport.service.js";
import { createPendingOperations } from "../../src/react/pending.service.js";
import { createRealtimeSessions } from "../../src/react/realtime-session.service.js";

it("executes the documented acquisition and joined disposal examples", async () => {
  const transport = createClientTransport(async () => ({ call: async () => 1 }));
  try {
    expect(await transport.invoke([], undefined, { context: {} })).toBe(1);
  } finally {
    await transport.close();
  }
  const pending = createPendingOperations({ memory: new Map(), storage: () => undefined });
  expect(await pending.digest({ input: 1 })).toMatch(/^sha256:[a-f0-9]{64}$/);
  const realtime = createRealtimeSessions({});
  try {
    expect(realtime.snapshot()).toBe("idle");
  } finally {
    await realtime.close();
  }
  expect(realtime.close()).toBe(realtime.close());
});
