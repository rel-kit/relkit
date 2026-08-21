import { describe, expect, test } from "bun:test";
import { awsProviders, defineEnv, env } from "@zsys/app";
import type { JobQueueFactoryContext } from "@zsys/engine";
import { awsProviderFactories, bindAwsProviderFactory, createSqsJobProvider } from "./src/index.ts";

describe("AWS runtime providers", () => {
  test("binds the AWS recipe to independent generation factories", async () => {
    const environment = defineEnv({ OPENAI_API_KEY: env.secret() });
    const providerSet = awsProviders({
      region: "us-east-1",
      buckets: { default: { bucketName: "assets" } },
      cache: { default: { endpoint: "redis://127.0.0.1:6379" } },
      jobs: { default: { queueUrl: "http://127.0.0.1/queue" } },
      events: { default: { busName: "events" } },
      modelProviders: {
        defaultProvider: "openai",
        defaultModel: "gpt-5-mini",
        openai: { apiKey: environment.OPENAI_API_KEY },
      },
    });
    const factory = bindAwsProviderFactory(providerSet);

    expect(Object.keys(awsProviderFactories)).toEqual(["aws"]);
    expect(factory?.recipeTag).toBe("aws");
    const first = await factory!.create({
      generationId: "aws-generation-1",
      environment: "production",
      providerSet,
      values: { OPENAI_API_KEY: "local-test-key" },
    });
    const second = await factory!.create({
      generationId: "aws-generation-2",
      environment: "production",
      providerSet,
      values: { OPENAI_API_KEY: "local-test-key" },
    });

    expect(first.generationId).not.toBe(second.generationId);
    expect(Object.keys(first.providers?.buckets ?? {})).toEqual(["default"]);
    expect(Object.keys(first.providers?.cache ?? {})).toEqual(["default"]);
    expect(Object.keys(first.providers?.jobs ?? {})).toEqual(["default"]);
    expect(Object.keys(first.providers?.events ?? {})).toEqual(["default"]);
    expect(first.modelRegistry).toBeDefined();
    expect(first.providers?.observability).toBeDefined();
    await first.dispose();
    await second.dispose();
  });

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
            "<ReceiveMessageResponse><Message><MessageId>message-1</MessageId><ReceiptHandle>receipt-1</ReceiptHandle><Body>{&quot;input&quot;:{&quot;orderId&quot;:&quot;order-1&quot;}}</Body><ApproximateReceiveCount>1</ApproximateReceiveCount></Message></ReceiveMessageResponse>",
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
    expect(leased).toMatchObject({ instanceId: "message-1", input: { orderId: "order-1" } });
    await queue.transition("message-1", "completed", { expectedState: "leased" });
    expect(actions).toEqual(["SendMessage", "ReceiveMessage", "DeleteMessage"]);
  });
});
