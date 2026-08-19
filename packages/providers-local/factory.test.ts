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
    const received: unknown[] = [];
    await generation?.providers.events.default?.registerContract({
      kind: "event",
      id: "test.created",
      version: 1,
      payload: { type: "object" },
      sensitiveFields: null,
    });
    await generation?.providers.events.default?.registerTrigger({
      id: "test.listener",
      source: { file: "factory.test.ts", line: 1, column: 1 },
      targetFunctionId: "test.handle",
      selector: { kind: "single" },
      expansion: ["test.created@1"],
      delivery: "ephemeral",
      profile: "default",
      invoke: async (envelope) => received.push(envelope),
    });
    await generation?.providers.events.default?.publish(
      { value: 1 },
      {},
      {
        operation: "publish",
        eventId: "test.created",
        version: 1,
        signal: new AbortController().signal,
        profile: "default",
        traceId: "trace-test",
      },
    );
    expect(received).toHaveLength(1);
    await generation?.dispose();

    expect(bindLocalProviderFactory(testProviders())?.recipeTag).toBe("test");
    expect(bindLocalProviderFactory(awsProviders({ region: "us-east-1" }))).toBeUndefined();
  });

  test("constructs advertised capabilities and distinct named profiles", async () => {
    const providerSet = localProviders({ cache: { archive: {} } });
    const generation = await bindLocalProviderFactory(providerSet)!.create({
      generationId: "generation-profiles",
      environment: "development",
      providerSet,
    });

    expect(generation.providers.cache.archive).not.toBe(generation.providers.cache.default);
    expect(generation.providers.jobs.default?.createQueue).toBeFunction();
    expect(generation.providers.models.default?.request).toBeFunction();
    generation.providers.observability.default?.collect({ ready: true });
    expect(generation.providers.observability.default?.read()).toEqual([{ ready: true }]);
    await generation.dispose();
  });
});
