import { expect, test } from "bun:test";
import {
  createDockerClient,
  DockerEngineError,
  randomLoopbackPort,
  type DockerCommandRunner,
} from "./src/runtime/index.ts";

const container = (health: "starting" | "healthy") =>
  JSON.stringify([
    {
      Id: "container-1",
      Name: "/redis",
      State: { Status: "running", Health: { Status: health } },
      Config: { Labels: { "dev.relkit.project": "shop" } },
      NetworkSettings: {
        Ports: { "6379/tcp": [{ HostIp: "127.0.0.1", HostPort: "49153" }] },
      },
    },
  ]);

test("discovers Docker and inspects labeled containers and volumes", async () => {
  const calls: string[][] = [];
  const run: DockerCommandRunner = async (arguments_) => {
    calls.push([...arguments_]);
    const command = arguments_.slice(0, 2).join(" ");
    const stdout =
      command === "version --format"
        ? JSON.stringify({ Version: "27.1.0" })
        : command === "container ls"
          ? "container-1\n"
          : command === "container inspect"
            ? container("healthy")
            : command === "volume ls"
              ? "volume-1\n"
              : JSON.stringify([{ Name: "volume-1", Labels: { "dev.relkit.project": "shop" } }]);
    return { exitCode: 0, stdout, stderr: "" };
  };
  const docker = createDockerClient({ run });

  expect(await docker.discover()).toEqual({ version: "27.1.0" });
  expect(await docker.containers({ z: "last", a: "first" })).toHaveLength(1);
  expect(await docker.volumes({ "dev.relkit.project": "shop" })).toHaveLength(1);
  expect(calls[1]).toEqual([
    "container",
    "ls",
    "--all",
    "--quiet",
    "--filter",
    "label=a=first",
    "--filter",
    "label=z=last",
  ]);
  expect(calls[2]).toEqual(["container", "inspect", "container-1"]);
  expect(randomLoopbackPort(6379)).toBe("127.0.0.1::6379");
});

test("validates argv and keeps Docker stderr out of failures", async () => {
  const secret = "database-password";
  let calls = 0;
  const docker = createDockerClient({
    run: async () => {
      calls += 1;
      return { exitCode: 9, stdout: "", stderr: secret };
    },
  });

  await expect(docker.command(["container", "ls\n--all"], "Docker listing")).rejects.toMatchObject({
    code: "RELKIT_DOCKER_ARGUMENT_INVALID",
  });
  try {
    await docker.command(["info"], "Docker info");
    throw new Error("expected Docker command to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(DockerEngineError);
    expect(error).toMatchObject({ code: "RELKIT_DOCKER_COMMAND_FAILED" });
    expect(String(error)).not.toContain(secret);
  }
  expect(calls).toBe(1);
});

test("reports Docker absence without exposing the host error", async () => {
  const hostError = "spawn docker ENOENT at /secret/path";
  const docker = createDockerClient({
    run: () => Promise.reject(new Error(hostError)),
  });

  try {
    await docker.discover();
    throw new Error("expected Docker discovery to fail");
  } catch (error) {
    expect(error).toMatchObject({ code: "RELKIT_DOCKER_UNAVAILABLE" });
    expect(String(error)).not.toContain(hostError);
  }
});

test("bounds health polling by the configured deadline", async () => {
  let clock = 0;
  let inspections = 0;
  const sleeps: number[] = [];
  const docker = createDockerClient({
    now: () => clock,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      clock += milliseconds;
    },
    run: async () => {
      inspections += 1;
      return { exitCode: 0, stdout: container("starting"), stderr: "" };
    },
  });

  await expect(
    docker.waitForHealthy("container-1", { timeoutMs: 10, pollIntervalMs: 4 }),
  ).rejects.toMatchObject({ code: "RELKIT_DOCKER_HEALTH_TIMEOUT" });
  expect(inspections).toBe(3);
  expect(sleeps).toEqual([4, 4, 2]);
});
