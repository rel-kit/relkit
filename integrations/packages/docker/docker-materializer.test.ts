import { expect, test } from "bun:test";
import { LOCAL_SERVICE_PROTOCOL_VERSION, type LocalServiceRecipe } from "@relkit/local-service";
import {
  createDockerMaterializer,
  type DockerClient,
  type DockerContainer,
} from "./src/runtime/index.ts";

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
