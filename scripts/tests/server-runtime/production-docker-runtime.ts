/** Runs a bounded generated image against actual production SQLite/auth. */
import { strict as assert } from "node:assert";
import { chmod, cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";
import { PRODUCTION_AUTH_SECRET, verifyProductionAuth } from "./production-auth-proof.js";
import { createBuilder, docker, Inspection } from "./production-docker-owner.js";
import type { DockerOwner } from "./production-docker-owner.types.js";
import { verifyProductionTask } from "./production-native-proof.js";

/**
 * Builds once, releases the builder CPU/memory, then exercises one capped runtime.
 * @param root - Owned acceptance fixture or relocated application root.
 * @param registryPort - Actual listener port reachable by the fixture container through host.docker.internal.
 * @param original - Generated Dockerfile bytes restored after the fixture proof.
 * @param names - Unique fixture builder, image and container identities with ownership state.
 * @returns After building the generated image and verifying bounded runtime auth and SIGTERM exit zero.
 */
export async function exerciseDockerImage(
  root: string,
  registryPort: number,
  original: string,
  names: DockerOwner,
) {
  const context = join(root, ".relkit/build");
  await createBuilder(names);
  await candidateDockerfile(context, original, registryPort);
  await docker([
    "buildx",
    "build",
    "--builder",
    names.builder,
    "--load",
    "--provenance=false",
    "--tag",
    names.image,
    context,
  ]);
  await docker(["buildx", "stop", names.builder]);
  const state = await dockerState(root);
  const port = await unusedPort();
  await startContainer(names.container, names.image, state, port);
  await verifyContainer(names.container, port);
  console.log(
    JSON.stringify({
      docker: {
        repairedAuth: true,
        ready: true,
        signupSessionSignoutSignin: true,
        jobsAlongsideAuth: { doubled: 42 },
        shutdown: 0,
        builderMemory: 805306368,
        builderCpu: 1,
        runtimeMemory: 536870912,
        runtimeCpu: 1,
      },
    }),
  );
}

/**
 * Only the copied test context's registry address differs from the generated Dockerfile.
 * @param context - Owned build directory used as the Docker context.
 * @param original - Generated Dockerfile bytes restored after the fixture proof.
 * @param registryPort - Actual listener port reachable by the fixture container through host.docker.internal.
 * @returns After substituting only the candidate registry address in the copied fixture Dockerfile.
 */
async function candidateDockerfile(context: string, original: string, registryPort: number) {
  const install = "RUN bun install --production --network-concurrency 1";
  assert.equal(original.split(install).length, 2);
  await writeFile(
    join(context, "Dockerfile"),
    original.replace(install, `${install} --registry http://host.docker.internal:${registryPort}`),
  );
}

/**
 * Reuses migrated pristine fixture data; application-owned history is never reset.
 * @param root - Owned acceptance fixture or relocated application root.
 * @returns The owned pristine migrated SQLite directory prepared for the runtime bind mount.
 */
async function dockerState(root: string): Promise<string> {
  const state = join(root, "docker-state");
  await mkdir(state);
  await cp(join(root, "pristine.sqlite"), join(state, "auth.sqlite"));
  await chmod(state, 0o777);
  await chmod(join(state, "auth.sqlite"), 0o666);
  return state;
}

/**
 * Reserves and releases only a fixture-owned temporary listener.
 * @returns The allocated host port after releasing its temporary fixture listener.
 */
async function unusedPort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = server.port;
  assert.ok(port);
  await server.stop(true);
  return port;
}

/**
 * Starts the generated image command without any development installation or shared mount.
 * @param name - Exact UUID-qualified runtime container name owned by the fixture.
 * @param image - Unique image tag produced by this fixture builder.
 * @param state - Owned copy of pristine migrated SQLite state mounted into the runtime.
 * @param port - Allocated host port used only by this fixture listener.
 * @returns After Docker starts the exact owned runtime with enforced CPU/memory and fixture environment.
 */
async function startContainer(name: string, image: string, state: string, port: number) {
  await docker([
    "run",
    "--detach",
    "--name",
    name,
    "--cpus",
    "1",
    "--memory",
    "512m",
    "--memory-swap",
    "512m",
    "--pids-limit",
    "128",
    "--publish",
    `127.0.0.1:${port}:3000`,
    "--mount",
    `type=bind,source=${state},target=/app/.relkit/state`,
    "--env",
    `BETTER_AUTH_URL=http://127.0.0.1:${port}`,
    "--env",
    `BETTER_AUTH_SECRET=${PRODUCTION_AUTH_SECRET}`,
    "--env",
    "DATABASE_PATH=/app/.relkit/state/auth.sqlite",
    image,
  ]);
}

/**
 * Exercises real HTTP and verifies a physical clean exit after Docker's SIGTERM.
 * @param name - Exact UUID-qualified runtime container name owned by the fixture.
 * @param port - Allocated host port used only by this fixture listener.
 * @returns After actual limits, HTTP auth behavior and physical clean SIGTERM exit are verified.
 */
async function verifyContainer(name: string, port: number) {
  const [container] = Schema.decodeUnknownSync(Inspection)(
    JSON.parse(await docker(["inspect", name])),
  );
  assert.equal(container?.HostConfig.Memory, 536870912);
  assert.equal(container?.HostConfig.NanoCpus, 1_000_000_000);
  const url = `http://127.0.0.1:${port}`;
  await containerReady(url);
  await verifyProductionAuth(url);
  await verifyProductionTask(url, () =>
    docker(["exec", name, "cat", "/app/.relkit/state/jobs/default/native/records.ndjson"]),
  );
  await docker(["stop", "--time", "5", name]);
  const [stopped] = Schema.decodeUnknownSync(Inspection)(
    JSON.parse(await docker(["inspect", name])),
  );
  assert.equal(stopped?.State.Running, false);
  assert.equal(stopped?.State.ExitCode, 0, await docker(["logs", name]));
}

/**
 * Bounds HTTP readiness while retaining the container's logs for any failure.
 * @param url - Actual allocated HTTP origin of the owned production server.
 * @returns After the owned runtime health endpoint responds successfully, rejecting at the fixed deadline.
 */
async function containerReady(url: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/_relkit/v1/health/ready`, {
        signal: AbortSignal.timeout(500),
      });
      const ready = response.ok;
      await response.text();
      if (ready) return;
    } catch {
      /* The owned container has not bound its listener yet. */
    }
    await Bun.sleep(100);
  }
  throw new Error("Production image readiness timed out");
}
