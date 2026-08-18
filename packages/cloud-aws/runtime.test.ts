import { describe, expect, test } from "bun:test";
import { awsProviders, defineEnv, env } from "@zsys/app";
import { createModelRequest } from "@zsys/agents";
import {
  awsProviderFactories,
  bindAwsProviderFactory,
  createOpenAiModelProvider,
} from "./src/index.ts";

describe("AWS runtime providers", () => {
  test("binds the AWS recipe to independent generation factories", async () => {
    const environment = defineEnv({ OPENAI_API_KEY: env.secret() });
    const providerSet = awsProviders({
      region: "us-east-1",
      buckets: { default: { bucketName: "assets" } },
      cache: { default: { endpoint: "redis://127.0.0.1:6379" } },
      jobs: { default: { queueUrl: "http://127.0.0.1/queue" } },
      events: { default: { busName: "events" } },
      models: {
        default: {
          provider: "openai",
          apiKey: environment.OPENAI_API_KEY,
          endpoint: "http://127.0.0.1",
        },
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
    expect(Object.keys(first.providers?.models ?? {})).toEqual(["default"]);
    expect(first.providers?.observability).toBeDefined();
    await first.dispose();
    await second.dispose();
  });

  test("uses a bounded local fake server for the OpenAI-compatible model", async () => {
    const authorizations: (string | null)[] = [];
    let requestCount = 0;
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        authorizations.push(request.headers.get("authorization"));
        requestCount += 1;
        if (requestCount > 1) return new Response("upstream unavailable", { status: 503 });
        return Response.json({
          choices: [{ message: { role: "assistant", content: "local response" } }],
        });
      },
    });
    try {
      const provider = createOpenAiModelProvider({
        profile: "default",
        apiKey: "local-test-key",
        model: "fake-model",
        endpoint: `http://127.0.0.1:${server.port}/v1/chat/completions`,
      });
      const request = createModelRequest({
        profile: "default",
        messages: [{ role: "user", content: "hello" }],
        maxInputBytes: 4096,
        maxOutputBytes: 4096,
      });

      await expect(provider.request(request)).resolves.toMatchObject({
        type: "final",
        output: "local response",
      });
      expect(authorizations[0]).toBe("Bearer local-test-key");
      await expect(provider.request(request)).rejects.toThrow(
        "OpenAI request failed with status 503",
      );
    } finally {
      server.stop(true);
    }
  });
});
