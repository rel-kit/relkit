import { DockerEngineError } from "./docker-types.js";
import { createServer, isIP } from "node:net";

export function randomLoopbackPort(containerPort: number): string {
  if (!Number.isSafeInteger(containerPort) || containerPort < 1 || containerPort > 65_535) {
    throw new DockerEngineError(
      "RELKIT_DOCKER_ARGUMENT_INVALID",
      "Docker container port is invalid.",
    );
  }
  return `127.0.0.1::${containerPort}`;
}

export async function publishedPortArguments(
  containerPort: number,
  gatewayAddress?: string,
  hostPort?: number,
): Promise<string[]> {
  const loopback = randomLoopbackPort(containerPort);
  if (
    hostPort !== undefined &&
    (!Number.isSafeInteger(hostPort) || hostPort < 1 || hostPort > 65_535)
  ) {
    throw new DockerEngineError(
      "RELKIT_DOCKER_ARGUMENT_INVALID",
      "Docker published port is invalid.",
    );
  }
  if (gatewayAddress === undefined) {
    return [
      "--publish",
      hostPort === undefined ? loopback : `127.0.0.1:${hostPort}:${containerPort}`,
    ];
  }
  if (
    isIP(gatewayAddress) !== 4 ||
    gatewayAddress === "0.0.0.0" ||
    gatewayAddress.startsWith("127.")
  ) {
    throw new DockerEngineError(
      "RELKIT_DOCKER_ARGUMENT_INVALID",
      "Docker bridge gateway is invalid.",
    );
  }
  const port = hostPort ?? (await availableHostPort());
  return [
    "--publish",
    `127.0.0.1:${port}:${containerPort}`,
    "--publish",
    `${gatewayAddress}:${port}:${containerPort}`,
  ];
}

async function availableHostPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", resolve);
  });
  try {
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("Unable to allocate a Docker port.");
    return address.port;
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

export function healthTimeout(id: string): never {
  throw new DockerEngineError(
    "RELKIT_DOCKER_HEALTH_TIMEOUT",
    `Docker container "${id}" did not become healthy in time.`,
  );
}

export function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const aborted = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", aborted, { once: true });
  });
}
