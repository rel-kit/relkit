/** Runs cancellation timing and full echo RPC acceptance against native state and HTTP/WebSocket fixtures. Scenario helpers retain the original assertions, ordering and lifetime cleanup. */
import { expect, test } from "vitest";
import { awaitFixtureCancellation } from "./fixture-lifetime.js";
import { createEchoRpcFixture } from "./agent-rpc-echo.fixture.js";
import {
  admitEchoRun,
  verifyEchoRun,
  verifyEchoReplay,
  verifyEchoStop,
} from "./agent-rpc-acceptance.case.js";

test.each(["before", "after"] as const)(
  "a held fixture run settles when cancellation arrives %s invocation",
  async (timing) => {
    const controller = new AbortController();
    const reason = new Error("The owning generation stopped this run.");
    if (timing === "before") controller.abort(reason);
    const held = awaitFixtureCancellation(controller.signal);
    if (timing === "after") controller.abort(reason);
    await expect(held).rejects.toBe(reason);
  },
);

test("agent run acceptance is idempotent and restores its durable thread", async () => {
  const fixture = await createEchoRpcFixture();
  const first = await admitEchoRun(fixture);
  const snapshot = await verifyEchoRun(fixture, first);
  await verifyEchoReplay(fixture, first, snapshot);
  await verifyEchoStop(fixture, first);
});
