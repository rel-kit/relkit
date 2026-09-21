import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localRecipe as inngestRecipe } from "../../integrations/packages/inngest/src/local-recipe/index.ts";
import {
  createDockerClient,
  createDockerMaterializer,
  type DockerClient,
} from "../../integrations/packages/docker/src/runtime/index.ts";
import {
  createLocalProjectIdentity,
  createLocalServiceReconciler,
  localProjectLabels,
  localResourceName,
  readLocalServiceSecrets,
  readProviderOverrides,
} from "../../integrations/packages/local/src/runtime/index.ts";
import {
  LOCAL_SERVICE_PLAN_VERSION,
  type LocalServicePlan,
} from "../../packages/local-service/src/index.ts";

const dockerTest = process.env.RELKIT_TEST_DOCKER === "1" ? test : test.skip;
const graphHash = `sha256:${"c".repeat(64)}`;
const planHash = `sha256:${"d".repeat(64)}`;
const bindingId = "provider.jobs.inngest";

dockerTest(
  "runs the Inngest composite through adoption and owned reset",
  { timeout: 300_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-composite-docker-"));
    const identity = createLocalProjectIdentity(root, "composite-docker-acceptance");
    const labels = localProjectLabels(identity);
    const docker = createDockerClient({ commandTimeoutMs: 120_000 });
    const materializer = createDockerMaterializer({ client: docker });
    const network = localResourceName(identity, bindingId, "network");
    const foreignNetwork = `${network}-foreign`;
    const worker = Bun.serve({
      hostname: "0.0.0.0",
      port: 0,
      fetch: () => Response.json({}),
    });
    try {
      const first = createLocalServiceReconciler({
        identity,
        materializer,
        preserveOnClose: true,
      });
      if (worker.port === undefined) throw new Error("The test worker port was not allocated.");
      const request = reconcileRequest(worker.port);
      const started = await first.reconcile(request);
      expect(started.started).toEqual([bindingId]);
      expect(started.state.services[0]).toMatchObject({
        bindingId,
        environment: "development",
        serviceGeneration: "generation-a",
        units: ["inngest", "postgres", "redis"],
      });

      const instances = await materializer.list(labels);
      expect(instances).toHaveLength(3);
      expect(instances.every((instance) => instance.health === "healthy")).toBe(true);
      expect(new Set(instances.map((instance) => instance.labels["dev.relkit.unit-kind"]))).toEqual(
        new Set(["container"]),
      );
      const overrides = readProviderOverrides(identity, planHash);
      const values = overrides?.bindings.find((binding) => binding.bindingId === bindingId)?.values;
      const baseUrl = new URL(text(values?.baseUrl));
      const api = instances.find(
        (instance) => instance.labels["dev.relkit.unit-id"] === "inngest",
      );
      const apiPort = api?.ports["8288/tcp"];
      expect(apiPort).toBeDefined();
      expect(baseUrl.hostname).toBe("127.0.0.1");
      expect(baseUrl.port).toBe(String(apiPort));
      expect(values?.postgresPassword).toBeUndefined();
      expect(readLocalServiceSecrets(identity)?.bindings[0]?.values.postgresPassword).toMatch(
        /^[a-f0-9]{48}$/u,
      );
      expect((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok).toBe(true);
      expect(await materializer.listVolumes(labels)).toHaveLength(2);
      expect(
        JSON.parse(
          await docker.command(
            ["network", "inspect", "--format", "{{json .Labels}}", network],
            "Composite network inspection",
          ),
        ),
      ).toMatchObject(labels);

      await first.close();
      const adopted = createLocalServiceReconciler({
        identity,
        materializer,
        preserveOnClose: true,
      });
      const recovered = await adopted.reconcile(request);
      expect(recovered.reused).toEqual([bindingId]);
      expect(recovered.started).toEqual([]);

      await docker.command(
        ["network", "create", "--label", "dev.relkit.managed=true", foreignNetwork],
        "Foreign network creation",
      );
      await adopted.close();
      const resetter = createLocalServiceReconciler({
        identity,
        materializer,
        preserveOnClose: false,
      });
      const reset = await resetter.reconcile(request);
      expect(reset.reused).toEqual([bindingId]);
      await resetter.close();
      await materializer.removeVolumes(labels);
      expect(await materializer.listVolumes(labels)).toHaveLength(0);
      expect(
        await docker.command(
          ["network", "inspect", "--format", "{{json .Labels}}", foreignNetwork],
          "Foreign network inspection",
        ),
      ).toContain("dev.relkit.managed");
    } finally {
      worker.stop(true);
      await cleanup(docker, materializer, labels, foreignNetwork);
      await rm(root, { recursive: true, force: true });
    }
  },
);

function reconcileRequest(workerPort: number) {
  return {
    plan: {
      version: LOCAL_SERVICE_PLAN_VERSION,
      graphHash,
      services: [
        {
          bindingId,
          capability: "job",
          profile: "inngest",
          materializerId: "docker",
          recipe: { integrationId: "inngest", recipeId: "inngest-docker", recipeVersion: 2 },
          configuration: {},
          requiredBy: ["jobs.inngest"],
        },
      ],
    } satisfies LocalServicePlan,
    planHash,
    recipes: { inngest: inngestRecipe },
    scope: "all" as const,
    environment: "development",
    serviceGeneration: "generation-a",
    endpoints: {
      [bindingId]: {
        serveOrigin: `http://host.docker.internal:${workerPort}`,
        servePath: "/api/inngest",
      },
    },
    environmentOverrides: {
      [bindingId]: { INNGEST_SDK_URL: `http://host.docker.internal:${workerPort}/api/inngest` },
    },
  };
}

function text(value: unknown): string {
  if (typeof value !== "string" || value === "") throw new Error("Missing Inngest base URL.");
  return value;
}

async function cleanup(
  docker: DockerClient,
  materializer: ReturnType<typeof createDockerMaterializer>,
  labels: Readonly<Record<string, string>>,
  foreignNetwork: string,
): Promise<void> {
  const containers = await docker.containers(labels).catch(() => []);
  for (const container of containers) {
    await materializer.stop?.(container.id).catch(() => undefined);
    await materializer.remove(container.id).catch(() => undefined);
  }
  await materializer.removeVolumes(labels).catch(() => undefined);
  await materializer.removeNetworks?.(labels).catch(() => undefined);
  await docker
    .command(["network", "rm", foreignNetwork], "Foreign network cleanup")
    .catch(() => undefined);
}
