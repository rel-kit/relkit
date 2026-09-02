import { Effect } from "effect";
import { describe, expect, test } from "bun:test";
import { defineEnv } from "@relkit/config";
import {
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import { createGenerationRuntime, type GenerationRuntimeOptions } from "./src/runtime.js";
import type { RuntimeManifest } from "./src/services.js";
import type { GenerationServiceDefinition } from "./src/scope.js";

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
): GenerationRuntimeOptions {
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
