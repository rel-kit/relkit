import { describe, expect, test } from "bun:test";
import type { JobQueueFactoryContext } from "@relkit/engine";
import { createSqsJobProvider } from "./src/index.ts";

describe("AWS runtime providers", () => {
  test("maps the materialized job queue contract to SQS send, receive, and acknowledge", async () => {
    const actions: string[] = [];
    const provider = createSqsJobProvider({
      region: "us-east-1",
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123/receipts",
      fetch: async (_url, init) => {
        const action = new URLSearchParams(String(init?.body)).get("Action") ?? "unknown";
        actions.push(action);
        if (action === "SendMessage")
          return new Response(
            "<SendMessageResponse><MessageId>message-1</MessageId></SendMessageResponse>",
          );
        if (action === "ReceiveMessage")
          return new Response(
            "<ReceiveMessageResponse><Message><MessageId>message-1</MessageId><ReceiptHandle>receipt-1</ReceiptHandle><Body>{&quot;input&quot;:{&quot;orderId&quot;:&quot;order-1&quot;,&quot;label&quot;:&quot;&amp;lt;&quot;}}</Body><ApproximateReceiveCount>1</ApproximateReceiveCount></Message></ReceiveMessageResponse>",
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

    await queue.enqueue({ input: { orderId: "order-1" }, profile: "default" });
    const leased = await queue.acquire();
    expect(leased).toMatchObject({
      instanceId: "message-1",
      input: { orderId: "order-1", label: "&lt;" },
    });
    await queue.transition("message-1", "completed", { expectedState: "leased" });
    expect(actions).toEqual(["SendMessage", "ReceiveMessage", "DeleteMessage"]);
  });
});
