import "../../tests/contracts/descriptor-cohort.test.ts";
import { describe, expect, test } from "bun:test";
import {
  awsProviders,
  copyProviderSets,
  env,
  defineEnv,
  localProviders,
  providerRecipe,
  testProviders,
} from "@zsys/app";

describe("provider declaration validation", () => {
  test("keeps metadata value-free and enforces recipe placement", () => {
    const local = localProviders();
    const redacted = localProviders();

    expect(providerRecipe(local)).toBe("local");
    expect(local.metadata.profiles).toEqual({});
    expect(local.metadata.environment).toEqual([]);
    expect(JSON.stringify(redacted)).not.toContain("synthetic-secret");
    expect(() => localProviders({ invalid: true } as never)).toThrow(
      "Unknown local provider option",
    );
    expect(() =>
      copyProviderSets({
        development: testProviders(),
        test: testProviders(),
        production: awsProviders({ region: "us-east-1" }),
      } as never),
    ).toThrow("development providers must use the local recipe");
  });

  test("stores value-free model provider recipes with required defaults", () => {
    const environment = defineEnv({ OPENAI_API_KEY: env.secret() });
    const local = localProviders({
      modelProviders: {
        defaultProvider: "openai",
        defaultModel: "gpt-5-mini",
        openai: { apiKey: environment.OPENAI_API_KEY },
        anthropic: { defaultModel: "claude-sonnet-4-5", apiKey: "synthetic-secret" },
      },
    });
    const configured = local.metadata.configuration.modelProviders;

    expect(configured).toEqual({
      defaultProvider: "openai",
      defaultModel: "gpt-5-mini",
      openai: { apiKey: environment.OPENAI_API_KEY },
      anthropic: {
        defaultModel: "claude-sonnet-4-5",
        apiKey: { kind: "sensitive-configuration", configured: true },
      },
    });
    expect(Object.isFrozen(configured)).toBe(true);
    expect(local.metadata.environment).toEqual([
      { name: "OPENAI_API_KEY", type: "secret-string", sensitive: true },
    ]);
    expect(JSON.stringify(local)).not.toContain("synthetic-secret");
    expect(() =>
      localProviders({
        modelProviders: { defaultProvider: "openai", openai: {} },
      } as never),
    ).toThrow("modelProviders.defaultModel is required");
    expect(() =>
      localProviders({
        modelProviders: { defaultModel: "gpt-5-mini", openai: {} },
      } as never),
    ).toThrow("modelProviders.defaultProvider is required");
    expect(() =>
      localProviders({
        modelProviders: { defaultProvider: "missing", defaultModel: "gpt-5-mini", openai: {} },
      } as never),
    ).toThrow('modelProviders.defaultProvider "missing" is not configured');
    expect(() =>
      localProviders({
        modelProviders: { defaultProvider: "open ai", defaultModel: "gpt-5-mini", "open ai": {} },
      } as never),
    ).toThrow('modelProviders provider name "open ai" must be a stable ID');
    expect(() =>
      localProviders({
        modelProviders: {
          defaultProvider: "openai",
          defaultModel: "gpt-5-mini",
          openai: { defaultModel: " " },
        },
      } as never),
    ).toThrow("modelProviders.openai.defaultModel must be non-empty text");
  });
});
