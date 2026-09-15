import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { localRecipe } from "../../integrations/packages/inngest/src/local-recipe/index.ts";
import {
  createDockerClient,
  createDockerMaterializer,
  type DockerClient,
} from "../../integrations/packages/docker/src/runtime/index.ts";
import {
  createLocalProjectIdentity,
  createLocalServiceReconciler,
  localProjectLabels,
  readLocalServiceSecrets,
} from "../../integrations/packages/local/src/runtime/index.ts";
import { LOCAL_SERVICE_PLAN_VERSION, type LocalServicePlan } from "../../packages/local-service/src/index.ts";

const dockerTest = process.env.RELKIT_TEST_DOCKER === "1" ? test : test.skip;
const graphHash = `sha256:${"e".repeat(64)}`;
const planHash = `sha256:${"f".repeat(64)}`;
const bindingId = "provider.jobs.worker";

dockerTest(
  "starts the generated worker as an owned Docker unit",
  { timeout: 300_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-worker-"));
    const bundleRoot = await mkdtemp(join(import.meta.dir, ".relkit-worker-bundle-"));
    const identity = createLocalProjectIdentity(root, "worker-docker-acceptance");
    const labels = localProjectLabels(identity);
    const docker = createDockerClient({ commandTimeoutMs: 120_000 });
    const materializer = createDockerMaterializer({ client: docker });
    try {
      const first = createLocalServiceReconciler({ identity, materializer, preserveOnClose: true });
      const initial = await first.reconcile(request());
      const secrets = readLocalServiceSecrets(identity)?.bindings[0]?.values;
      if (secrets === undefined) throw new Error("Worker test secrets were not persisted.");
      const source = join(bundleRoot, "worker.ts");
      const entrypoint = join(bundleRoot, "server", "index.js");
      await mkdir(join(bundleRoot, "server"), { recursive: true });
      await writeFile(source, workerSource(), "utf8");
      const built = await Bun.build({ entrypoints: [source], outfile: entrypoint, target: "bun" });
      if (!built.success) throw new Error("Unable to build the worker fixture.");
      const output = built.outputs[0];
      if (output === undefined) throw new Error("Worker fixture produced no bundle.");
      await writeFile(entrypoint, await output.arrayBuffer());
      const activated = await first.reconcile({
        ...request(),
        environmentOverridesByUnit: {
          [bindingId]: { inngest: { INNGEST_SDK_URL: "http://worker:3000/api/inngest" } },
        },
        workerArtifacts: {
          [bindingId]: {
            entrypoint,
            providerOverridesFile: firstOverrideFile(identity),
            environment: {
              INNGEST_EVENT_KEY: secrets.eventKey,
              INNGEST_SIGNING_KEY: secrets.signingKey,
            },
          },
        },
      });
      expect(initial.started).toEqual([bindingId]);
      expect(activated.started).toEqual([bindingId]);
      const instances = await materializer.list(labels);
      expect(instances).toHaveLength(4);
      expect(instances.find((instance) => instance.labels["dev.relkit.unit-id"] === "worker")).toMatchObject({
        health: "healthy",
        labels: { "dev.relkit.unit-kind": "worker" },
      });
      await first.close();
    } finally {
      await cleanup(docker, materializer, labels);
      await rm(root, { recursive: true, force: true });
      await rm(bundleRoot, { recursive: true, force: true });
    }
  },
);

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
        recipe: { integrationId: "inngest", recipeId: "inngest-docker", recipeVersion: 2 },
        configuration: {},
        requiredBy: ["jobs.worker"],
      }],
    } satisfies LocalServicePlan,
    planHash,
    recipes: { inngest: localRecipe },
    scope: "all" as const,
    environment: "development",
    serviceGeneration: "generation-worker",
  };
}

function firstOverrideFile(identity: ReturnType<typeof createLocalProjectIdentity>): string {
  return join(identity.projectRoot, ".relkit", "state", "local", identity.localProjectId.slice("sha256:".length), "provider-overrides.json");
}

function workerSource(): string {
  return `import { Inngest } from "inngest";
import { serve } from "inngest/bun";
const client = new Inngest({ id: "relkit-worker", baseUrl: "http://inngest:8288", eventKey: process.env.INNGEST_EVENT_KEY, signingKey: process.env.INNGEST_SIGNING_KEY, isDev: false });
const handler = serve({ client, functions: [], servePath: "/api/inngest", serveOrigin: "http://worker:3000" });
Bun.serve({ hostname: "0.0.0.0", port: 3000, fetch: (request) => new URL(request.url).pathname === "/_relkit/v1/health/ready" ? Response.json({ status: "ready" }) : handler(request) });`;
}

async function cleanup(
  docker: DockerClient,
  materializer: ReturnType<typeof createDockerMaterializer>,
  labels: Readonly<Record<string, string>>,
): Promise<void> {
  const containers = await docker.containers(labels).catch(() => []);
  for (const container of containers) {
    await materializer.stop?.(container.id).catch(() => undefined);
    await materializer.remove(container.id).catch(() => undefined);
  }
  await materializer.removeVolumes(labels).catch(() => undefined);
  await materializer.removeNetworks?.(labels).catch(() => undefined);
}
