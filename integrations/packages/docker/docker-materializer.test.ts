import { expect, test } from "bun:test";
import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
  type CompositeLocalServiceRecipe,
  type LocalServiceRecipe,
} from "@relkit/local-service";
import {
  createDockerMaterializer,
  type DockerClient,
  type DockerContainer,
} from "./src/runtime/index.ts";
import { publishedPortArguments } from "./src/runtime/docker-health.ts";
import { parseContainers } from "./src/runtime/docker-inspect.ts";

test("publishes Linux local ports on loopback and the Docker bridge gateway", async () => {
  expect(await publishedPortArguments(6379, "172.17.0.1", 49_153)).toEqual([
    "--publish",
    "127.0.0.1:49153:6379",
    "--publish",
    "172.17.0.1:49153:6379",
  ]);
  expect(await publishedPortArguments(6379, undefined, 49_153)).toEqual([
    "--publish",
    "127.0.0.1:49153:6379",
  ]);
  await expect(publishedPortArguments(6379, "0.0.0.0", 49_153)).rejects.toThrow(
    "gateway is invalid",
  );
  const container = {
    Id: "container-1",
    Name: "/redis",
    Config: { Labels: {} },
    State: { Status: "running" },
    NetworkSettings: {
      Ports: {
        "6379/tcp": [
          { HostIp: "172.17.0.1", HostPort: "49153" },
          { HostIp: "127.0.0.1", HostPort: "49153" },
        ],
      },
    },
  };
  expect(parseContainers(JSON.stringify([container]))[0]?.ports["6379/tcp"]).toBe(49_153);
  container.NetworkSettings.Ports["6379/tcp"][0]!.HostIp = "0.0.0.0";
  expect(() => parseContainers(JSON.stringify([container]))).toThrow("invalid data");
});

test("creates a labeled loopback-only container and persistent volume", async () => {
  const calls: string[][] = [];
  const healthy: DockerContainer = {
    id: "container-1",
    name: "redis",
    labels: { "dev.relkit.managed": "true" },
    state: "running",
    health: "healthy",
    ports: { "6379/tcp": 49_153 },
  };
  const client: DockerClient = {
    discover: async () => ({ version: "29.0.0" }),
    command: async (arguments_) => {
      calls.push([...arguments_]);
      return arguments_[1] === "create" && arguments_[0] === "container" ? "container-1" : "";
    },
    containers: async () => [],
    volumes: async () => [],
    inspectContainer: async () => healthy,
    waitForHealthy: async () => healthy,
  };
  const recipe: LocalServiceRecipe = {
    kind: "local-service-recipe",
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    integrationId: "redis",
    recipeId: "redis-docker",
    recipeVersion: 1,
    materializerId: "docker",
    image: `redis:pinned@sha256:${"a".repeat(64)}`,
    command: ["redis-server", "--appendonly", "yes"],
    ports: { redis: 6379 },
    volume: { mountPath: "/data" },
    health: { command: ["redis-cli", "PING"], intervalMs: 250, timeoutMs: 2_000, retries: 40 },
    outputs: () => ({}),
  };
  const materializer = createDockerMaterializer({ client });

  expect(
    await materializer.start({
      name: "relkit-redis",
      volumeName: "relkit-redis-data",
      labels: { "dev.relkit.managed": "true" },
      recipe,
      environmentFile: "/project/.relkit/state/local/secret.env",
    }),
  ).toBe(healthy);
  expect(calls[0]).toEqual([
    "volume",
    "create",
    "--label",
    "dev.relkit.managed=true",
    "relkit-redis-data",
  ]);
  const create = calls[1]!;
  for (const expected of [
    "127.0.0.1::6379",
    "type=volume,source=relkit-redis-data,target=/data",
    "/project/.relkit/state/local/secret.env",
    "redis-cli PING",
  ]) {
    expect(create).toContain(expected);
  }
  expect(create.join(" ")).not.toContain("password");
  expect(calls[2]).toEqual(["container", "start", "container-1"]);
});

test("rejects an invalid composite graph before Docker mutation", async () => {
  let mutations = 0;
  const client: DockerClient = {
    discover: async () => ({ version: "29.0.0" }),
    command: async () => {
      mutations += 1;
      return "container-1";
    },
    containers: async () => [],
    volumes: async () => [],
    inspectContainer: async () => ({
      id: "container-1",
      name: "x",
      labels: {},
      state: "running",
      health: "healthy",
      ports: {},
    }),
    waitForHealthy: async () => ({
      id: "container-1",
      name: "x",
      labels: {},
      state: "running",
      health: "healthy",
      ports: {},
    }),
  };
  const recipe = {
    kind: "local-service-recipe",
    protocolVersion: LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
    integrationId: "test",
    recipeId: "composite",
    recipeVersion: 2,
    materializerId: "docker",
    units: [
      {
        id: "a",
        kind: "container",
        image: "a@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        dependsOn: ["b"],
        ports: { api: 8080 },
      },
      {
        id: "b",
        kind: "worker",
        image: "b@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        dependsOn: ["a"],
        ports: { api: 8080 },
      },
    ],
    volumes: {},
    outputs: () => ({}),
  } satisfies CompositeLocalServiceRecipe;
  const materializer = createDockerMaterializer({ client });
  await expect(
    materializer.start({ name: "relkit-test", labels: { "dev.relkit.managed": "true" }, recipe }),
  ).rejects.toThrow("dependency cycle");
  expect(mutations).toBe(0);
});

test("materializes an owned private composite network in dependency order", async () => {
  const calls: string[][] = [];
  const client: DockerClient = {
    discover: async () => ({ version: "29.0.0" }),
    command: async (arguments_) => {
      calls.push([...arguments_]);
      if (arguments_[0] === "network" && arguments_[1] === "inspect") {
        throw new Error("Docker network inspection failed with exit code 1.");
      }
      if (arguments_[0] === "container" && arguments_[1] === "create") {
        return `container-${calls.filter((call) => call[0] === "container" && call[1] === "create").length}`;
      }
      return "";
    },
    containers: async () => [],
    volumes: async () => [],
    inspectContainer: async (id) => healthy(id),
    waitForHealthy: async (id) => healthy(id),
  };
  const recipe = {
    kind: "local-service-recipe",
    protocolVersion: LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
    integrationId: "test",
    recipeId: "composite",
    recipeVersion: 2,
    materializerId: "docker",
    network: { internal: true },
    containers: [
      {
        id: "database",
        image: "postgres@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      {
        id: "api",
        image: "api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        dependsOn: ["database"],
        ports: { http: 8080 },
      },
    ],
    volumes: { data: { mountPath: "/data", persistent: true } },
    outputs: ({ ports }) => ({ endpoint: `http://127.0.0.1:${ports["api.http"]}` }),
  } satisfies CompositeLocalServiceRecipe;
  const instance = await createDockerMaterializer({ client }).start({
    name: "relkit-test",
    labels: { "dev.relkit.managed": "true", "dev.relkit.local-project-id": "project" },
    recipe,
    volumeNames: { data: "relkit-test-data" },
    networkName: "relkit-test-network",
  });
  const networkCreate = calls.find((call) => call[0] === "network" && call[1] === "create");
  expect(networkCreate).toContain("--internal");
  const volumeCreate = calls.find((call) => call[0] === "volume" && call[1] === "create");
  expect(volumeCreate).toContain("--label");
  expect(volumeCreate).toContain("dev.relkit.volume=data");
  expect(
    calls
      .filter((call) => call[0] === "container" && call[1] === "create")
      .map((call) => call[call.indexOf("--name") + 1]),
  ).toEqual(["relkit-test-database", "relkit-test-api"]);
  expect(instance.units?.map((unit) => unit.unitId)).toEqual(["database", "api"]);
  expect(instance.ports.http).toBe(49_152);
});

test("starts a recipe-owned worker with read-only bundle and state mounts", async () => {
  const calls: string[][] = [];
  const client: DockerClient = {
    discover: async () => ({ version: "29.0.0" }),
    command: async (arguments_) => {
      calls.push([...arguments_]);
      if (arguments_[0] === "network" && arguments_[1] === "inspect") {
        throw new Error("Docker network inspection failed with exit code 1.");
      }
      if (arguments_[0] === "container" && arguments_[1] === "create") {
        return `container-${calls.filter((call) => call[0] === "container" && call[1] === "create").length}`;
      }
      return "";
    },
    containers: async () => [],
    volumes: async () => [],
    inspectContainer: async (id) => healthy(id),
    waitForHealthy: async (id) => healthy(id),
  };
  const recipe = {
    kind: "local-service-recipe",
    protocolVersion: LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
    integrationId: "test",
    recipeId: "worker-composite",
    recipeVersion: 2,
    materializerId: "docker",
    containers: [
      {
        id: "inngest",
        image: "inngest@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ],
    workers: [
      {
        id: "worker",
        image: "oven/bun@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        dependsOn: ["inngest"],
        ports: { api: 3000 },
        health: { command: ["kill", "-0", "1"], intervalMs: 250, timeoutMs: 1_000, retries: 4 },
      },
    ],
    volumes: {},
    outputs: () => ({}),
  } satisfies CompositeLocalServiceRecipe;
  const materializer = createDockerMaterializer({ client });

  await materializer.start({
    name: "relkit-worker",
    labels: { "dev.relkit.managed": "true" },
    recipe,
    networkName: "relkit-worker-network",
    workerArtifact: {
      entrypoint: "/tmp/relkit-build/server/index.js",
      providerOverridesFile: "/tmp/relkit-state/provider-overrides.json",
    },
    portBindings: { worker: { api: 49_152 } },
    bindMounts: {
      worker: [
        { source: "/tmp/relkit-build", target: "/relkit-worker", readOnly: true },
        { source: "/tmp/relkit-state", target: "/relkit-state", readOnly: true },
      ],
    },
    environmentVariablesByUnit: {
      worker: {
        RELKIT_PROVIDER_OVERRIDES_FILE: "/relkit-state/provider-overrides.json",
        RELKIT_WORKER_ROLE: "worker",
      },
    },
  });

  const worker = calls.find((call) => call.includes("relkit-worker-worker"));
  if (worker === undefined) throw new Error("Worker container was not created.");
  expect(worker).toContain("type=bind,source=/tmp/relkit-build,target=/relkit-worker,readonly");
  expect(worker).toContain("type=bind,source=/tmp/relkit-state,target=/relkit-state,readonly");
  expect(worker).toContain("127.0.0.1:49152:3000");
  expect(worker).toContain("RELKIT_PROVIDER_OVERRIDES_FILE=/relkit-state/provider-overrides.json");
  expect(worker).toContain("RELKIT_WORKER_ROLE=worker");
});

function healthy(id: string): DockerContainer {
  return {
    id,
    name: id,
    labels: {},
    state: "running",
    health: "healthy",
    ports: { "8080/tcp": 49_152 },
  };
}
