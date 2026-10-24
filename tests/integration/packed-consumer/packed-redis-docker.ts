/** Owns one labeled native Redis container and joins its removal after packed provider probes. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { createDockerClient } from "../../../integrations/packages/docker/src/runtime/docker-client.js";
import type { DockerClient } from "../../../integrations/packages/docker/src/runtime/docker-types.js";
import { localRecipe } from "../../../integrations/packages/redis/src/local-recipe/index.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";

const HostLimits = Schema.Struct({
  Memory: Schema.Literal(536_870_912),
  MemorySwap: Schema.Literal(536_870_912),
  NanoCpus: Schema.Literal(1_000_000_000),
  PidsLimit: Schema.Literal(128),
});

/** Starts the repository's digest-pinned Redis image with explicit native host limits. */
function startRedis(docker: DockerClient, name: string) {
  return docker.command(
    [
      "run",
      "--detach",
      "--name",
      name,
      "--label",
      `dev.relkit.packed-mixed=${name}`,
      "--publish",
      "127.0.0.1::6379",
      "--memory",
      "512m",
      "--memory-swap",
      "512m",
      "--cpus",
      "1",
      "--pids-limit",
      "128",
      "--health-cmd",
      "redis-cli ping",
      "--health-interval",
      "1s",
      "--health-retries",
      "30",
      localRecipe.image,
    ],
    "Packed Redis acquisition",
    { timeoutMs: 60_000 },
  );
}

/** Removes only the unique labeled container and proves its own anonymous volumes disappeared. */
async function releaseRedis(docker: DockerClient, name: string, root: string): Promise<void> {
  const labels = { "dev.relkit.packed-mixed": name };
  const removedVolumes: string[] = [];
  for (const container of await docker.containers(labels)) {
    const mounts = await docker.command(
      [
        "inspect",
        "--format",
        '{{range .Mounts}}{{if eq .Type "volume"}}{{println .Name}}{{end}}{{end}}',
        container.id,
      ],
      "Packed Redis owned volume names",
    );
    removedVolumes.push(...mounts.split("\n").filter(Boolean));
    await docker.command(
      ["container", "rm", "--force", "--volumes", container.id],
      "Packed Redis removal",
    );
  }
  assert.deepEqual(await docker.containers(labels), []);
  const volumes = (
    await docker.command(
      ["volume", "ls", "--format", "{{.Name}}"],
      "Packed Redis remaining volumes",
    )
  ).split("\n");
  const remainingVolumes = removedVolumes.filter((volume) => volumes.includes(volume));
  assert.deepEqual(remainingVolumes, []);
  await writeFile(
    join(root, "docker-cleanup.json"),
    JSON.stringify({ name, remaining: [], removedVolumes, remainingVolumes }, null, 2),
  );
}

/** Acquires a healthy loopback-only Redis endpoint within the caller's Scope. */
export const packedRedisEndpoint = Effect.fn("PackedMixed.redisEndpoint")(function* (root: string) {
  const docker = createDockerClient();
  const name = `relkit-packed-mixed-${crypto.randomUUID()}`;
  yield* Effect.acquireRelease(Effect.succeed(name), () =>
    scaffoldNative("packed.redis.release", () => releaseRedis(docker, name, root)).pipe(
      Effect.orDie,
    ),
  );
  yield* scaffoldNative("packed.redis.start", () => startRedis(docker, name));
  const host = yield* scaffoldNative("packed.redis.nativeLimits", () =>
    docker.command(
      ["inspect", "--format", "{{json .HostConfig}}", name],
      "Packed Redis native limits",
    ),
  );
  const limits = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(HostLimits))(host);
  const mounts = yield* scaffoldNative("packed.redis.mounts", () =>
    docker.command(["inspect", "--format", "{{json .Mounts}}", name], "Packed Redis owned mounts"),
  );
  const container = yield* scaffoldNative("packed.redis.ready", () =>
    docker.waitForHealthy(name, { timeoutMs: 45_000 }),
  );
  const port = container.ports["6379/tcp"];
  assert.ok(port, "Owned Redis has no published loopback port");
  yield* scaffoldNative("packed.redis.receipt", () =>
    writeFile(
      join(root, "docker.json"),
      JSON.stringify({ container, limits, mounts: JSON.parse(mounts) as unknown }, null, 2),
    ),
  );
  return `redis://127.0.0.1:${port}`;
});
