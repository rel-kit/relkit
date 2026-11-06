import { spawn, type ChildProcess } from "node:child_process";
import {
  DockerEngineError,
  type DockerCommandRequest,
  type DockerCommandResult,
  type DockerCommandRunner,
} from "./docker-types.js";

export function dockerCommandRunner(executable = "docker"): DockerCommandRunner {
  return async (arguments_, options) => run(executable, arguments_, options);
}

async function run(
  executable: string,
  arguments_: readonly string[],
  options: DockerCommandRequest,
): Promise<DockerCommandResult> {
  if (options.signal?.aborted) cancelled();
  const timeoutMs = options.timeoutMs ?? 15_000;
  return new Promise<DockerCommandResult>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(executable, [...arguments_], {
        stdio: ["ignore", "pipe", "pipe"],
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch {
      reject(new DockerEngineError("RELKIT_DOCKER_UNAVAILABLE", "Docker is unavailable."));
      return;
    }
    let timedOut = false;
    let failure: DockerEngineError | undefined;
    let bytes = 0;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const collect = (chunks: Buffer[]) => (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > options.maxOutputBytes) {
        failure ??= new DockerEngineError(
          "RELKIT_DOCKER_OUTPUT_LIMIT",
          "Docker command output exceeded its safe limit.",
        );
        child.kill();
        return;
      }
      chunks.push(chunk);
    };
    child.stdout?.on("data", collect(stdout));
    child.stderr?.on("data", collect(stderr));
    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (options.signal?.aborted || error.name === "AbortError") {
        reject(new DockerEngineError("RELKIT_DOCKER_CANCELLED", "Docker operation was cancelled."));
        return;
      }
      reject(new DockerEngineError("RELKIT_DOCKER_UNAVAILABLE", "Docker is unavailable."));
    });
    child.once("close", (code: number | null) => {
      clearTimeout(timer);
      if (failure !== undefined) return reject(failure);
      if (options.signal?.aborted)
        return reject(
          new DockerEngineError("RELKIT_DOCKER_CANCELLED", "Docker operation was cancelled."),
        );
      if (timedOut)
        return reject(
          new DockerEngineError("RELKIT_DOCKER_COMMAND_TIMEOUT", "Docker command timed out."),
        );
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

function cancelled(): never {
  throw new DockerEngineError("RELKIT_DOCKER_CANCELLED", "Docker operation was cancelled.");
}
