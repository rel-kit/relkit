import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LOCAL_SERVICE_PLAN_VERSION,
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type LocalServiceInstance,
  type LocalServiceMaterializerRuntime,
  type LocalServicePlan,
  type LocalServiceRecipe,
} from "@relkit/local-service";
import {
  createLocalProjectIdentity,
  createLocalServiceReconciler,
  readProviderOverrides,
} from "./src/runtime/index.ts";

const graphHash = `sha256:${"1".repeat(64)}`;
const firstPlanHash = `sha256:${"2".repeat(64)}`;
const secondPlanHash = `sha256:${"3".repeat(64)}`;

test("reconciles required bindings and reuses only unchanged healthy services", async () => {
  const root = mkdtempSync(join(tmpdir(), "relkit-local-reconcile-"));
  try {
    const identity = createLocalProjectIdentity(root, "commerce");
    const instances = new Map<string, LocalServiceInstance>();
    const starts: string[] = [];
    const removes: string[] = [];
    const materializer: LocalServiceMaterializerRuntime = {
      kind: "local-service-materializer-runtime",
      protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
      integrationId: "docker",
      list: async (labels) =>
        [...instances.values()].filter((instance) =>
          Object.entries(labels).every(([key, value]) => instance.labels[key] === value),
        ),
      start: async (request) => {
        starts.push(request.labels["dev.relkit.binding-id"]!);
        const instance = Object.freeze({
          id: `container-${starts.length}`,
          name: request.name,
          labels: request.labels,
          state: "running",
          health: "healthy" as const,
          ports: Object.freeze(
            Object.fromEntries(
              Object.entries(request.recipe.ports).map(([name], index) => [name, 49_150 + index]),
            ),
          ),
        });
        instances.set(instance.id, instance);
        return instance;
      },
      remove: async (id) => {
        removes.push(id);
        instances.delete(id);
      },
      removeVolumes: async () => undefined,
    };
    const reconciler = createLocalServiceReconciler({ identity, materializer });

    const first = await reconciler.reconcile({
      plan: plan(false),
      planHash: firstPlanHash,
      recipes,
      scope: "required",
    });
    expect(first.started).toEqual(["provider.cache.default"]);
    expect(starts).toEqual(["provider.cache.default"]);
    const firstSecret = readProviderOverrides(identity)?.bindings[0]?.values.secret;
    const unchanged = await reconciler.reconcile({
      plan: plan(false),
      planHash: firstPlanHash,
      recipes,
      scope: "required",
    });
    expect(unchanged.reused).toEqual(["provider.cache.default"]);
    expect(unchanged.overrides.generationId).toBe(first.overrides.generationId);

    await materializer.remove("container-1");
    const restarted = await reconciler.reconcile({
      plan: plan(false),
      planHash: firstPlanHash,
      recipes,
      scope: "required",
    });
    expect(restarted.started).toEqual(["provider.cache.default"]);
    expect(readProviderOverrides(identity)?.bindings[0]?.values.secret).toBe(firstSecret);
    expect(restarted.overrides.generationId).toBe(first.overrides.generationId);

    const changed = await reconciler.reconcile({
      plan: plan(true),
      planHash: secondPlanHash,
      recipes,
      scope: "required",
    });
    expect(changed.reused).toEqual(["provider.cache.default"]);
    expect(changed.started).toEqual(["provider.bucket.default"]);
    expect(starts).toEqual([
      "provider.cache.default",
      "provider.cache.default",
      "provider.bucket.default",
    ]);
    expect(removes).toEqual(["container-1"]);
    expect(changed.overrides.generationId).not.toBe(first.overrides.generationId);
    await reconciler.close();
    expect(removes).toHaveLength(3);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

const recipes = Object.freeze({
  redis: recipe("redis", "redis-docker", "redis", 6379, "url"),
  s3: recipe("s3", "minio-docker", "api", 9000, "endpoint"),
});

function recipe(
  integrationId: string,
  recipeId: string,
  portName: string,
  containerPort: number,
  outputName: string,
): LocalServiceRecipe {
  return Object.freeze({
    kind: "local-service-recipe",
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    integrationId,
    recipeId,
    recipeVersion: 1,
    materializerId: "docker",
    image: `${integrationId}:pinned@sha256:${"a".repeat(64)}`,
    ports: Object.freeze({ [portName]: containerPort }),
    health: Object.freeze({ command: ["true"], intervalMs: 100, timeoutMs: 100, retries: 3 }),
    generatedSecrets: Object.freeze({ secret: Object.freeze({ bytes: 8 }) }),
    outputs: ({ ports, secrets }) =>
      Object.freeze({
        [outputName]: `http://127.0.0.1:${ports[portName]}`,
        secret: secrets.secret!,
      }),
  });
}

function plan(bucketRequired: boolean): LocalServicePlan {
  return {
    version: LOCAL_SERVICE_PLAN_VERSION,
    graphHash,
    services: [
      service("provider.cache.default", "cache", "redis", "redis-docker", ["orders.get"]),
      service(
        "provider.bucket.default",
        "bucket",
        "s3",
        "minio-docker",
        bucketRequired ? ["assets"] : [],
      ),
    ],
  };
}

function service(
  bindingId: string,
  capability: string,
  integrationId: string,
  recipeId: string,
  requiredBy: readonly string[],
) {
  return {
    bindingId,
    capability,
    profile: "default",
    materializerId: "docker",
    recipe: { integrationId, recipeId, recipeVersion: 1 },
    configuration: {},
    requiredBy,
  };
}
