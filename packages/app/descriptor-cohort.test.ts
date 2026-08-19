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
    const environment = defineEnv({ API_KEY: env.secret(), AWS_REGION: env.string() });
    const local = localProviders({
      models: { default: { apiKey: environment.API_KEY, endpoint: "https://model.test" } },
    });
    const redacted = localProviders({ models: { default: { apiKey: "synthetic-secret" } } });

    expect(providerRecipe(local)).toBe("local");
    expect(local.metadata.profiles).toEqual({ default: ["models"] });
    expect(local.metadata.environment).toEqual([
      { name: "API_KEY", type: "secret-string", sensitive: true },
    ]);
    expect(JSON.stringify(local)).not.toContain("synthetic-secret");
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
});
