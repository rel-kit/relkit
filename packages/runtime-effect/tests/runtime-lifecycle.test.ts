import { Effect, Layer } from "effect";
import { it } from "@effect/vitest";
import { resolveEnvWithEffectEffect } from "@relkit/config/internal/config";
import { describe, expect, test } from "vitest";
import { defineEnv } from "@relkit/config";
import {
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import {
  createGenerationRuntime,
  generationLayer,
  Generation,
  GenerationEnvironmentResolver,
  type GenerationRuntimeOptions,
} from "../src/runtime.js";
import type { RuntimeManifest } from "../src/services.js";
import type { GenerationServiceDefinition } from "../src/scope.js";
import { interruptOnSignal } from "../src/scope.js";
import { validateGenerationOptionsEffect } from "../src/runtime-validation.js";
import { Cause, Exit } from "effect";
import type { LogRecord } from "../src/logger.js";

const graph = {
  contractVersion: GRAPH_VERSION,
  nodes: [],
  edges: [],
} satisfies ApplicationGraph;

const manifest = {
  contractVersion: MANIFEST_VERSION,
  generatorVersion: GENERATOR_VERSION,
  graphHash: "graph-hash",
  activationFingerprint: {
    graphHash: "graph-hash",
    manifestHash: "sha256:manifest",
    runtimeIntegrationsPlanHash: "sha256:runtime-integrations",
  },
  runtimeIntegrationsPlan: {
    version: RUNTIME_INTEGRATION_PLAN_VERSION,
    fileName: RUNTIME_INTEGRATION_PLAN_FILE,
    graphHash: "graph-hash",
  },
  functions: {},
  middleware: {},
  requestTransforms: {},
} satisfies RuntimeManifest;

const environment = defineEnv({});

function options(
  services: readonly GenerationServiceDefinition[],
  signal?: AbortSignal,
): GenerationRuntimeOptions<{}> {
  return {
    environment: "test",
    env: environment,
    source: {},
    graph,
    graphHash: manifest.graphHash,
    manifest,
    services,
    ...(signal === undefined ? {} : { signal }),
  };
}

function resource(
  id: string,
  events: string[],
  acquire: () => Effect.Effect<unknown, unknown, never> = () => Effect.succeed(id),
): GenerationServiceDefinition {
  return {
    id,
    acquire: () => {
      events.push(`acquire:${id}`);
      return acquire();
    },
    release: () => Effect.sync(() => events.push(`release:${id}`)),
  };
}

async function rejects(promise: Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await promise;
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}

describe("generation runtime resource ownership", () => {
  test("managed startup and release use the configured structured logger", async () => {
    const records: LogRecord[] = [];
    const events: string[] = [];
    const generation = await createGenerationRuntime({
      ...options([resource("provider", events)]),
      logger: {
        minimumLevel: "info",
        human: false,
        json: { write: (record) => records.push(record) },
      },
    });
    await generation.dispose();
    expect(records.some((record) => record.fields?.operation === "generation.acquire")).toBe(true);
    expect(records.some((record) => record.fields?.operation === "service.release")).toBe(true);
    expect(records.every((record) => record.level === "info")).toBe(true);
  });

  it.effect("configuration errors retain their public cause in the typed channel", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        validateGenerationOptionsEffect({
          ...options([]),
          environment: "production",
          allowImplicitDotEnv: true,
        }),
      );
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const reason = result.cause.reasons.find(Cause.isFailReason);
        expect(reason?.error._tag).toBe("GenerationConfigurationError");
        expect(reason?.error.cause).toBeInstanceOf(TypeError);
      }
    }),
  );

  it.effect("reads pre-aborted signals lazily before starting work", () =>
    Effect.gen(function* () {
      const controller = new AbortController();
      let ran = false;
      const effect = interruptOnSignal(
        Effect.sync(() => {
          ran = true;
        }),
        controller.signal,
      );
      controller.abort("cancelled before execution");
      const result = yield* Effect.exit(effect);
      expect(ran).toBe(false);
      expect(Exit.isFailure(result)).toBe(true);
    }),
  );

  test("invalid resource order preserves the public TypeError before acquisition", async () => {
    const events: string[] = [];
    await expect(
      createGenerationRuntime(
        options([{ ...resource("provider", events), dependencies: ["missing"] }]),
      ),
    ).rejects.toBeInstanceOf(TypeError);
    expect(events).toEqual([]);
  });

  it.effect("builds lazily with a substituted resolver acquired once", () =>
    Effect.gen(function* () {
      let calls = 0;
      const events: string[] = [];
      const testLayer = Layer.succeed(
        GenerationEnvironmentResolver,
        GenerationEnvironmentResolver.of({
          resolve: (definition, source, environment) =>
            Effect.suspend(() => {
              calls += 1;
              return resolveEnvWithEffectEffect(definition, source, environment);
            }),
        }),
      );
      const layer = generationLayer(options([resource("provider", events)]), testLayer);
      expect(calls).toBe(0);
      expect(events).toEqual([]);
      const generation = yield* Effect.scoped(Effect.provide(Generation, layer));
      expect(calls).toBe(1);
      expect(generation.services.get("provider")).toBe("provider");
      expect(events).toEqual(["acquire:provider", "release:provider"]);
    }),
  );

  test("disposal is idempotent for concurrent callers", async () => {
    const events: string[] = [];
    const generation = await createGenerationRuntime(options([resource("provider", events)]));
    const first = generation.dispose();
    expect(generation.dispose()).toBe(first);
    await first;
    expect(events).toEqual(["acquire:provider", "release:provider"]);
  });

  test("rejects a previous runtime cohort before acquiring resources", async () => {
    await expect(
      createGenerationRuntime({
        ...options([]),
        manifest: { ...manifest, contractVersion: MANIFEST_VERSION - 1 } as never,
      }),
    ).rejects.toThrow("Rebuild with `relkit build`");
  });

  test("releases acquired resources in reverse order after success", async () => {
    const events: string[] = [];
    const generation = await createGenerationRuntime(
      options([
        resource("config", events),
        { ...resource("provider", events), dependencies: ["config"] },
      ]),
    );

    await generation.dispose();

    expect(events).toEqual([
      "acquire:config",
      "acquire:provider",
      "release:provider",
      "release:config",
    ]);
  });

  test("releases acquired resources when a later service fails", async () => {
    const events: string[] = [];
    await rejects(
      createGenerationRuntime(
        options([
          resource("config", events),
          resource("provider", events, () => Effect.fail(new Error("provider failed"))),
        ]),
      ),
    );

    expect(events).toEqual(["acquire:config", "acquire:provider", "release:config"]);
  });

  test("interrupts pending acquisition and releases completed work", async () => {
    const events: string[] = [];
    const controller = new AbortController();
    let started!: () => void;
    const pendingStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = resource("provider", events, () => {
      started();
      return Effect.never;
    });
    const creation = createGenerationRuntime(
      options([resource("config", events), pending], controller.signal),
    );

    await pendingStarted;
    controller.abort(new Error("startup interrupted"));
    await rejects(creation);

    expect(events).toEqual(["acquire:config", "acquire:provider", "release:config"]);
  });

  test("releases only the partially acquired prefix after failure", async () => {
    const events: string[] = [];
    await rejects(
      createGenerationRuntime(
        options([
          resource("config", events),
          resource("cache", events),
          resource("worker", events, () => Effect.fail(new Error("worker failed"))),
        ]),
      ),
    );

    expect(events).toEqual([
      "acquire:config",
      "acquire:cache",
      "acquire:worker",
      "release:cache",
      "release:config",
    ]);
  });
});
