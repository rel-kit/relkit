import { describe, expect, test } from "bun:test";
import { awsProviders, localProviders, testProviders } from "@zsys/app";
import {
  bindLocalProviderFactory,
  getLocalProviderFactory,
  localProviderFactories,
} from "./src/index.ts";

describe("local provider recipe bindings", () => {
  test("binds local and test tags per generation and leaves AWS unbound", async () => {
    expect(Object.keys(localProviderFactories)).toEqual(["local", "test"]);
    expect(getLocalProviderFactory("aws")).toBeUndefined();

    const local = localProviders();
    const factory = bindLocalProviderFactory(local);
    expect(factory?.recipeTag).toBe("local");
    const generation = await factory?.create({
      generationId: "generation-local",
      environment: "development",
      providerSet: local,
    });
    expect(generation?.recipeTag).toBe("local");
    expect(generation?.providerSet).toBe(local);
    await generation?.dispose();

    expect(bindLocalProviderFactory(testProviders())?.recipeTag).toBe("test");
    expect(bindLocalProviderFactory(awsProviders({ region: "us-east-1" }))).toBeUndefined();
  });
});
