import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDockerClient,
  createDockerMaterializer,
  type DockerClient,
} from "../../integrations/packages/docker/src/runtime/index.ts";
import {
  createLocalProjectIdentity,
  createLocalServiceReconciler,
  localProjectLabels,
  readLocalServiceState,
  readProviderOverrides,
} from "../../integrations/packages/local/src/runtime/index.ts";
import { localRecipe as redisRecipe } from "../../integrations/packages/redis/src/local-recipe/index.ts";
import { createRedisClient } from "../../integrations/packages/redis/src/runtime/index.ts";
import { localRecipe as s3Recipe } from "../../integrations/packages/s3/src/local-recipe/index.ts";
import { createS3BucketProvider } from "../../integrations/packages/s3/src/runtime/index.ts";
import {
  LOCAL_SERVICE_PLAN_VERSION,
  type LocalServiceInstance,
  type LocalServiceMaterializerRuntime,
  type LocalServicePlan,
  type ProviderOverrideState,
} from "../../packages/local-service/src/index.ts";

const dockerTest = process.env.RELKIT_TEST_DOCKER === "1" ? test : test.skip;
const graphHash = `sha256:${"a".repeat(64)}`;
const planHash = `sha256:${"b".repeat(64)}`;
const bindingIds = [
  "provider.bucket.assets",
  "provider.cache.primary",
  "provider.cache.secondary",
] as const;

dockerTest(
  "runs isolated Redis and MinIO services through adoption, persistence, and cleanup",
  { timeout: 300_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-local-docker-"));
    const identity = createLocalProjectIdentity(root, "local-docker-acceptance");
    const labels = localProjectLabels(identity);
    const docker = createDockerClient({ commandTimeoutMs: 120_000 });
    const materializer = createDockerMaterializer({ client: docker });
    try {
      const abandoned = createLocalServiceReconciler({
        identity,
        materializer,
        preserveOnClose: true,
      });
      const initial = await abandoned.reconcile(reconcileRequest());
      expect(initial.started).toEqual(bindingIds);

      const firstState = requiredOverrides(identity);
      const firstInstances = await materializer.list(labels);
      expect(firstInstances).toHaveLength(3);
      expect(firstInstances.every((instance) => instance.health === "healthy")).toBe(true);
      expect(new Set(redisPorts(firstInstances)).size).toBe(2);

      const primary = createRedisClient({
        url: bindingText(firstState, "provider.cache.primary", "url"),
      });
      const secondary = createRedisClient({
        url: bindingText(firstState, "provider.cache.secondary", "url"),
      });
      await Promise.all([primary.connect(), secondary.connect()]);
      expect(await Promise.all([primary.ping(), secondary.ping()])).toEqual([true, true]);
      await Promise.all([primary.set("profile", "primary"), secondary.set("profile", "secondary")]);
      expect(await Promise.all([primary.get("profile"), secondary.get("profile")])).toEqual([
        "primary",
        "secondary",
      ]);
      await Bun.sleep(1_100);
      primary.close();
      secondary.close();

      const firstBucket = bucketProvider(firstState);
      await firstBucket.put("persistent.txt", new TextEncoder().encode("survives-restart"));
      expect(new TextDecoder().decode(await firstBucket.get("persistent.txt"))).toBe(
        "survives-restart",
      );

      const accessKey = bindingText(firstState, "provider.bucket.assets", "accessKeyId");
      const secretKey = bindingText(firstState, "provider.bucket.assets", "secretAccessKey");
      const safeSnapshot = JSON.stringify({ initial, instances: firstInstances });
      expect(safeSnapshot).not.toContain(accessKey);
      expect(safeSnapshot).not.toContain(secretKey);

      const recovered = createLocalServiceReconciler({
        identity,
        materializer,
        preserveOnClose: true,
      });
      const adopted = await recovered.reconcile(reconcileRequest());
      expect(adopted.reused).toEqual(bindingIds);
      expect(adopted.started).toEqual([]);
      expect(adopted.overrides.generationId).toBe(initial.overrides.generationId);

      const beforeRestart = await materializer.list(labels);
      await Promise.all(
        ["provider.bucket.assets", "provider.cache.primary"].map((bindingId) =>
          materializer.remove(instanceFor(beforeRestart, bindingId).id),
        ),
      );

      const owner = createLocalServiceReconciler({ identity, materializer });
      const restarted = await owner.reconcile(reconcileRequest());
      expect(restarted.started).toEqual(["provider.bucket.assets", "provider.cache.primary"]);
      expect(restarted.reused).toEqual(["provider.cache.secondary"]);

      const secondState = requiredOverrides(identity);
      const restartedRedis = createRedisClient({
        url: bindingText(secondState, "provider.cache.primary", "url"),
      });
      await restartedRedis.connect();
      expect(await restartedRedis.get("profile")).toBe("primary");
      restartedRedis.close();
      expect(bindingText(secondState, "provider.bucket.assets", "accessKeyId")).toBe(accessKey);
      expect(bindingText(secondState, "provider.bucket.assets", "secretAccessKey")).toBe(secretKey);
      expect(
        new TextDecoder().decode(await bucketProvider(secondState).get("persistent.txt")),
      ).toBe("survives-restart");

      await owner.close();
      await materializer.removeVolumes(labels);
      expect(await docker.containers(labels)).toEqual([]);
      expect(await docker.volumes(labels)).toEqual([]);
      expect(readProviderOverrides(identity)).toBeUndefined();
      expect(readLocalServiceState(identity)).toBeUndefined();
    } finally {
      await cleanup(docker, materializer, labels);
      await rm(root, { recursive: true, force: true });
    }
  },
);

function reconcileRequest() {
  return {
    plan: localPlan(),
    planHash,
    recipes: { redis: redisRecipe, s3: s3Recipe },
    scope: "all" as const,
  };
}

function localPlan(): LocalServicePlan {
  return {
    version: LOCAL_SERVICE_PLAN_VERSION,
    graphHash,
    services: [
      service("provider.cache.primary", "cache", "primary", "redis", "redis-docker"),
      service("provider.cache.secondary", "cache", "secondary", "redis", "redis-docker"),
      service("provider.bucket.assets", "bucket", "assets", "s3", "minio-docker"),
    ],
  };
}

function service(
  bindingId: string,
  capability: string,
  profile: string,
  integrationId: string,
  recipeId: string,
) {
  return {
    bindingId,
    capability,
    profile,
    materializerId: "docker",
    recipe: { integrationId, recipeId, recipeVersion: 1 },
    configuration: {},
    requiredBy: [`acceptance.${profile}`],
  };
}

function requiredOverrides(identity: ReturnType<typeof createLocalProjectIdentity>) {
  const state = readProviderOverrides(identity, planHash);
  if (state === undefined) throw new Error("Provider overrides were not written.");
  return state;
}

function bindingText(state: ProviderOverrideState, bindingId: string, field: string): string {
  const value = state.bindings.find((binding) => binding.bindingId === bindingId)?.values[field];
  if (typeof value !== "string" || value === "") throw new Error(`Missing ${bindingId}.${field}.`);
  return value;
}

function bucketProvider(state: ProviderOverrideState) {
  return createS3BucketProvider({
    endpoint: bindingText(state, "provider.bucket.assets", "endpoint"),
    bucketName: bindingText(state, "provider.bucket.assets", "bucketName"),
    region: bindingText(state, "provider.bucket.assets", "region"),
    credentials: {
      accessKeyId: bindingText(state, "provider.bucket.assets", "accessKeyId"),
      secretAccessKey: bindingText(state, "provider.bucket.assets", "secretAccessKey"),
    },
    forcePathStyle: true,
  });
}

function instanceFor(instances: readonly LocalServiceInstance[], bindingId: string) {
  const instance = instances.find(
    (candidate) => candidate.labels["dev.relkit.binding-id"] === bindingId,
  );
  if (instance === undefined) throw new Error(`Missing container for ${bindingId}.`);
  return instance;
}

function redisPorts(instances: readonly LocalServiceInstance[]): number[] {
  return instances
    .filter((instance) => instance.labels["dev.relkit.binding-id"]?.includes("cache"))
    .map((instance) => instance.ports.redis ?? instance.ports["6379/tcp"]!);
}

async function cleanup(
  docker: DockerClient,
  materializer: LocalServiceMaterializerRuntime,
  labels: Readonly<Record<string, string>>,
): Promise<void> {
  const containers = await docker.containers(labels).catch(() => []);
  await Promise.all(
    containers.map((container) => materializer.remove(container.id).catch(() => {})),
  );
  await materializer.removeVolumes(labels).catch(() => {});
}
