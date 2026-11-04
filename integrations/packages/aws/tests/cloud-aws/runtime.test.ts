import { describe, expect, test } from "bun:test";
import { createEventBridgeProvider } from "../../src/cloud-aws/index.ts";

describe("AWS runtime providers", () => {
  test("round-trips EventBridge propagation separately from payload", async () => {
    let detail: Record<string, unknown> | undefined;
    const provider = createEventBridgeProvider({
      region: "us-east-1",
      busName: "application",
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { Entries: Array<{ Detail: string }> };
        detail = JSON.parse(body.Entries[0]!.Detail) as Record<string, unknown>;
        return Response.json({ FailedEntryCount: 0, Entries: [{ EventId: "event-1" }] });
      },
    });
    const propagation = {
      version: 2 as const,
      producer: {
        traceId: "20000000000000000000000000000002",
        spanId: "2000000000000002",
        traceFlags: 1,
      },
      originRequestId: "request-1",
    };
    await provider.publish(
      { orderId: "order-1" },
      {},
      {
        operation: "publish",
        eventId: "orders.created",
        version: 1,
        signal: new AbortController().signal,
        profile: "default",
        propagation,
      },
    );
    expect(detail).toMatchObject({ payload: { orderId: "order-1" }, propagation });
  });
});
