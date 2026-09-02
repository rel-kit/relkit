import { DockerEngineError } from "./docker-types.js";

export function randomLoopbackPort(containerPort: number): string {
  if (!Number.isSafeInteger(containerPort) || containerPort < 1 || containerPort > 65_535) {
    throw new DockerEngineError(
      "RELKIT_DOCKER_ARGUMENT_INVALID",
      "Docker container port is invalid.",
    );
  }
  return `127.0.0.1::${containerPort}`;
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
