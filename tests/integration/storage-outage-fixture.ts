/** Owns labelled Redis/MinIO fixtures with stable test ports and joins cleanup after native assertions. */
import { expect } from "bun:test";
import { dockerCommandRunner } from "../../integrations/packages/docker/src/runtime/docker-runner.ts";
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
  readProviderOverrides,
} from "../../integrations/packages/local/src/runtime/index.ts";
import { localRecipe as redisRecipe } from "../../integrations/packages/redis/src/local-recipe/index.ts";
import { localRecipe as s3Recipe } from "../../integrations/packages/s3/src/local-recipe/index.ts";
import {
  LOCAL_SERVICE_PLAN_VERSION,
  type LocalServiceInstance,
  type ProviderOverrideState,
} from "../../packages/local-service/src/index.ts";

/** Owns the disposable project, containers and volumes even when an assertion fails.
 * @param run - Native assertions receiving only this fixture's services and bindings.
 * @returns Completion after service teardown and temporary-directory cleanup. */
export async function withStorage(
  run: (
    docker: DockerClient,
    instances: readonly LocalServiceInstance[],
    state: ProviderOverrideState,
  ) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "relkit-storage-outage-"));
  const identity = createLocalProjectIdentity(root, "storage-outage");
  const labels = localProjectLabels(identity);
  const docker = fixedPortDocker();
  const materializer = createDockerMaterializer({ client: docker });
  const owner = createLocalServiceReconciler({ identity, materializer });
  try {
    await owner.reconcile({
      plan: {
        version: LOCAL_SERVICE_PLAN_VERSION,
        graphHash: `sha256:${"a".repeat(64)}`,
        services: [
          {
            bindingId: "cache",
            capability: "cache",
            profile: "outage",
            materializerId: "docker",
            recipe: { integrationId: "redis", recipeId: "redis-docker", recipeVersion: 1 },
            configuration: {},
            requiredBy: ["outage"],
          },
          {
            bindingId: "bucket",
            capability: "bucket",
            profile: "outage",
            materializerId: "docker",
            recipe: { integrationId: "s3", recipeId: "minio-docker", recipeVersion: 1 },
            configuration: {},
            requiredBy: ["outage"],
          },
        ],
      },
      planHash: `sha256:${"b".repeat(64)}`,
      recipes: { redis: redisRecipe, s3: s3Recipe },
      scope: "all",
    });
    const state = readProviderOverrides(identity);
    if (state === undefined) throw new Error("Test provider bindings were not published");
    await run(docker, await materializer.list(labels), state);
  } finally {
    try {
      await owner.close();
      await materializer.removeVolumes(labels);
      expect(await docker.containers(labels)).toEqual([]);
      expect(await docker.volumes(labels)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}

/** Requires a real binding value before constructing a provider.
 * @param state - Validated local bindings. @param id - Owned binding. @param field - Required setting.
 * @returns Nonempty configured value. */
export function binding(state: ProviderOverrideState, id: string, field: string): string {
  const value = state.bindings.find((binding) => binding.bindingId === id)?.values[field];
  if (typeof value !== "string" || value === "") throw new Error(`Missing ${id}.${field}`);
  return value;
}

/** Resolves only an instance returned by this fixture's label-scoped listing.
 * @param instances - Owned instances. @param id - Fixture binding ID. @returns Container identity. */
export function instance(instances: readonly LocalServiceInstance[], id: string): string {
  const value = instances.find((instance) => instance.labels["dev.relkit.binding-id"] === id);
  if (value === undefined) throw new Error(`Missing test container: ${id}`);
  return value.id;
}

/** Pins ephemeral host ports so a Docker stop/start tests connectivity rather than endpoint migration.
 * @returns The real Docker adapter with only test container port allocation replaced. */
function fixedPortDocker(): DockerClient {
  const run = dockerCommandRunner();
  return createDockerClient({
    commandTimeoutMs: 60_000,
    run: async (args, options) => {
      const pinned = [...args];
      for (let i = 0; i < pinned.length; i++) {
        const port = pinned[i]?.match(/^127\.0\.0\.1::(\d+)$/)?.[1];
        if (port === undefined) continue;
        const listener = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
        pinned[i] = `127.0.0.1:${listener.port}:${port}`;
        await listener.stop(true);
      }
      return run(pinned, options);
    },
  });
}
