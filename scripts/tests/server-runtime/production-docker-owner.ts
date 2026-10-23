/** Owns exact Docker proof identities, enforced builder limits and physical cleanup. */
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Schema } from "effect";
import type { DockerOwner } from "./production-docker-owner.types.js";

const execute = promisify(execFile);
export const Inspection = Schema.Array(
  Schema.Struct({
    HostConfig: Schema.Struct({
      Memory: Schema.Number,
      CpuQuota: Schema.Number,
      CpuPeriod: Schema.Number,
      NanoCpus: Schema.Number,
    }),
    State: Schema.Struct({ Running: Schema.Boolean, ExitCode: Schema.Number }),
  }),
);

/**
 * Executes only a bounded explicit command and preserves native diagnostic causes.
 * @param args - Explicit Docker CLI arguments targeting this proof only.
 * @returns Trimmed native command output; failures retain the original process error as their cause.
 */
export async function docker(args: readonly string[]): Promise<string> {
  try {
    const result = await execute("docker", [...args], {
      timeout: 180_000,
      killSignal: "SIGTERM",
      maxBuffer: 8_388_608,
    });
    return (args[0] === "logs" ? result.stdout + result.stderr : result.stdout).trim();
  } catch (cause) {
    throw new Error(`Docker production proof failed: ${args.join(" ")}`, { cause });
  }
}

/**
 * Verifies the documented driver settings through actual Docker HostConfig.
 * @param owner - Unique builder, image and container identities allocated by the fixture.
 * @returns After creating the owned builder and verifying its actual CPU and memory limits.
 */
export async function createBuilder(owner: DockerOwner) {
  const name = owner.builder;
  await docker([
    "buildx",
    "create",
    "--name",
    name,
    "--node",
    `${name}0`,
    "--driver",
    "docker-container",
    "--driver-opt",
    "memory=768m,cpu-period=100000,cpu-quota=100000,restart-policy=no",
  ]);
  owner.builderCreated = true;
  await docker(["buildx", "inspect", "--bootstrap", name]);
  const [builder] = Schema.decodeUnknownSync(Inspection)(
    JSON.parse(await docker(["inspect", `buildx_buildkit_${name}0`])),
  );
  assert.equal(builder?.HostConfig.Memory, 805306368);
  assert.equal(builder?.HostConfig.CpuQuota, 100000);
  assert.equal(builder?.HostConfig.CpuPeriod, 100000);
}

/**
 * Discovers and removes only exact owned objects, retaining every cleanup failure.
 * @param owner - Unique builder, image and container identities allocated by the fixture.
 * @param failed - Whether failed runtime logs should be collected before removal.
 * @returns Every retained cleanup failure after attempting removal and verifying exact owned identities.
 */
export async function cleanupDocker(owner: DockerOwner, failed: boolean): Promise<Error[]> {
  const errors: Error[] = [];
  try {
    const container = await docker([
      "ps",
      "--all",
      "--quiet",
      "--filter",
      `name=^/${owner.container}$`,
    ]);
    if (container !== "") {
      if (failed)
        try {
          console.error(await docker(["logs", owner.container]));
        } catch (cause) {
          errors.push(new Error("Owned runtime logs failed", { cause }));
        }
      await docker(["rm", "--force", owner.container]);
    }
  } catch (cause) {
    errors.push(new Error("Owned runtime cleanup failed", { cause }));
  }
  try {
    const image = await docker(["image", "ls", "--quiet", "--filter", `reference=${owner.image}`]);
    if (image !== "") await docker(["image", "rm", owner.image]);
  } catch (cause) {
    errors.push(new Error("Owned image cleanup failed", { cause }));
  }
  if (owner.builderCreated)
    try {
      await docker(["buildx", "rm", "--force", owner.builder]);
    } catch (cause) {
      errors.push(new Error("Owned builder cleanup failed", { cause }));
    }
  try {
    await verifyRemoved(owner);
  } catch (cause) {
    errors.push(new Error("Owned Docker cleanup verification failed", { cause }));
  }
  return errors;
}

/**
 * Verifies all exact fixture-owned runtime, builder and state volume identities are gone.
 * @param owner - Unique builder, image and container identities allocated by the fixture.
 * @returns After the exact owned runtime, builder container and builder state volume are absent.
 */
async function verifyRemoved(owner: DockerOwner) {
  assert.equal(
    await docker(["ps", "--all", "--quiet", "--filter", `name=^/${owner.container}$`]),
    "",
  );
  assert.equal(
    await docker([
      "ps",
      "--all",
      "--quiet",
      "--filter",
      `name=^/buildx_buildkit_${owner.builder}0$`,
    ]),
    "",
  );
  assert.equal(
    await docker([
      "volume",
      "ls",
      "--quiet",
      "--filter",
      `name=^buildx_buildkit_${owner.builder}0_state$`,
    ]),
    "",
  );
}
