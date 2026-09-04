import { describe, expect, test } from "bun:test";
import type { JobQueueFactoryContext } from "@relkit/engine";
import { createEventBridgeProvider, createSqsJobProvider } from "./src/index.ts";

describe("AWS runtime providers", () => {
  test("maps the materialized job queue contract to SQS send, receive, and acknowledge", async () => {
    const actions: string[] = [];
    let messageBody = "{}";
    const provider = createSqsJobProvider({
      region: "us-east-1",
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123/receipts",
      fetch: async (_url, init) => {
        const action = new URLSearchParams(String(init?.body)).get("Action") ?? "unknown";
        actions.push(action);
        if (action === "SendMessage") {
          messageBody = new URLSearchParams(String(init?.body)).get("MessageBody") ?? "{}";
          return new Response(
            "<SendMessageResponse><MessageId>message-1</MessageId></SendMessageResponse>",
          );
        }
        if (action === "ReceiveMessage")
          return new Response(
            `<ReceiveMessageResponse><Message><MessageId>message-1</MessageId><ReceiptHandle>receipt-1</ReceiptHandle><Body>${messageBody.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</Body><ApproximateReceiveCount>1</ApproximateReceiveCount></Message></ReceiveMessageResponse>`,
          );
        return new Response("<ok/>");
      },
    });
    const queue = provider.createQueue({
      jobId: "receipts.send-job",
      targetFunctionId: "receipts.send",
      profile: "default",
      retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
      registration: { kind: "job", id: "receipts.send-job" },
    } as JobQueueFactoryContext);

    const propagation = {
      version: 2 as const,
      producer: {
        traceId: "10000000000000000000000000000001",
        spanId: "1000000000000001",
        traceFlags: 1,
      },
    };
    await queue.enqueue({
      input: { orderId: "order-1", label: "&lt;" },
      profile: "default",
      propagation,
    });
    const leased = await queue.acquire();
    expect(leased).toMatchObject({
      instanceId: "message-1",
      input: { orderId: "order-1", label: "&lt;" },
      propagation: {
        producer: { traceId: propagation.producer.traceId, spanId: propagation.producer.spanId },
      },
    });
    await queue.transition("message-1", "completed", { expectedState: "leased" });
    expect(actions).toEqual(["SendMessage", "ReceiveMessage", "DeleteMessage"]);
  });

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
