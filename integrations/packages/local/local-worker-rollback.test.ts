import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  LOCAL_SERVICE_PLAN_VERSION,
  LOCAL_SERVICE_PROTOCOL_VERSION,
  LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
  type LocalServiceInstance,
  type LocalServiceMaterializerRuntime,
  type LocalServicePlan,
  type CompositeLocalServiceRecipe,
} from "@relkit/local-service";
import {
  createLocalProjectIdentity,
  createLocalServiceReconciler,
} from "./src/runtime/index.ts";

const graphHash = "sha256:" + "1".repeat(64);
const planHash = "sha256:" + "2".repeat(64);
const bindingId = "provider.jobs.worker";

test("keeps existing composite units when a new worker fails to start", async () => {
  const root = mkdtempSync(join("/tmp", "relkit-worker-rollback-"));
  try {
    const identity = createLocalProjectIdentity(root, "rollback");
    let existing: readonly LocalServiceInstance[] = [];
    const removed: string[] = [];
    let starts = 0;
    const materializer: LocalServiceMaterializerRuntime = {
      kind: "local-service-materializer-runtime",
      protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
      integrationId: "docker",
      list: async () => existing,
      start: async (request) => {
        starts += 1;
        if (starts === 2) throw new Error("worker image failed to start");
        const unit = {
          id: "database",
          name: request.name + "-database",
          labels: {
            ...request.labels,
            "dev.relkit.unit-id": "database",
            "dev.relkit.unit-kind": "container",
          },
          state: "running",
          health: "healthy" as const,
          ports: {},
          unitId: "database",
        } satisfies LocalServiceInstance;
        existing = [unit];
        return Object.freeze({ ...unit, units: Object.freeze([unit]), networkName: "network" });
      },
      remove: async (id) => {
        removed.push(id);
        existing = existing.filter((unit) => unit.id !== id);
      },
      removeVolumes: async () => undefined,
    };
    const reconciler = createLocalServiceReconciler({ identity, materializer });
    await reconciler.reconcile(request());
    await expect(
      reconciler.reconcile({
        ...request(),
        workerArtifacts: {
          [bindingId]: {
            entrypoint: "/tmp/relkit-build/server/index.js",
            providerOverridesFile: "/tmp/relkit-state/provider-overrides.json",
          },
        },
      }),
    ).rejects.toThrow("worker image failed to start");
    expect(removed).toEqual([]);
    expect(existing).toHaveLength(1);
    await reconciler.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function request() {
  return {
    plan: {
      version: LOCAL_SERVICE_PLAN_VERSION,
      graphHash,
      services: [{
        bindingId,
        capability: "job",
        profile: "inngest",
        materializerId: "docker",
        recipe: { integrationId: "test", recipeId: "worker", recipeVersion: 2 },
        configuration: {},
        requiredBy: ["jobs.worker"],
      }],
    } satisfies LocalServicePlan,
    planHash,
    recipes: { test: recipe },
    scope: "required" as const,
    environment: "development",
    serviceGeneration: "generation",
  };
}

const recipe = {
  kind: "local-service-recipe",
  protocolVersion: LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
  integrationId: "test",
  recipeId: "worker",
  recipeVersion: 2,
  materializerId: "docker",
  containers: [{
    id: "database",
    image: "database@sha256:" + "a".repeat(64),
  }],
  workers: [{
    id: "worker",
    image: "worker@sha256:" + "b".repeat(64),
    dependsOn: ["database"],
  }],
  volumes: {},
  outputs: () => ({}),
} satisfies CompositeLocalServiceRecipe;
