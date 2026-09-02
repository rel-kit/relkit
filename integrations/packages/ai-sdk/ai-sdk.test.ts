import { expect, test } from "bun:test";
import { createBindingValueRef, normalizeProviderSource } from "@relkit/provider";
import { aiSdk } from "./src/index.ts";
import { createAiSdkModelProvider } from "./src/runtime/index.ts";

const apiKey = createBindingValueRef<"OPENAI_API_KEY", string, "secret-string">(
  "OPENAI_API_KEY",
  "secret-string",
);

test("authors one immutable model profile without loading a model", () => {
  const adapter = aiSdk({ provider: "openai", defaultModel: "gpt-5-mini", apiKey });

  expect(adapter).toMatchObject({
    integration: { integrationId: "ai-sdk" },
    capability: { id: "model" },
    adapterId: "ai-sdk",
    connection: { apiKey: { name: "OPENAI_API_KEY", sensitive: true } },
    behavior: { value: { provider: "openai", defaultModel: "gpt-5-mini" } },
  });
  expect(normalizeProviderSource(adapter).source).toEqual({ kind: "connected" });
  expect(Object.isFrozen(adapter)).toBe(true);
});

test("rejects unsafe credentials and provider-specific settings", () => {
  const unsafe = aiSdk as (options: unknown) => unknown;
  expect(() =>
    unsafe({ provider: "openai", defaultModel: "gpt-5-mini", apiKey: "secret" }),
  ).toThrow("named secret binding value");
  expect(() =>
    aiSdk({
      provider: "anthropic",
      defaultModel: "claude-sonnet-4-5",
      apiKey,
      organization: "org",
    }),
  ).toThrow("OpenAI-only");
});

test("constructs only the selected AI SDK provider and resolves profile selectors", async () => {
  const provider = await createAiSdkModelProvider({
    profile: "primary",
    connection: { apiKey: "test-key" },
    behavior: { provider: "openai", defaultModel: "gpt-5-mini" },
  });

  expect(provider.resolveModel()).toMatchObject({ id: "primary:gpt-5-mini" });
  expect(provider.resolveModel("primary:gpt-4.1")).toMatchObject({ id: "primary:gpt-4.1" });
  expect(() => provider.resolveModel("secondary:gpt-4.1")).toThrow("is not active");
});
