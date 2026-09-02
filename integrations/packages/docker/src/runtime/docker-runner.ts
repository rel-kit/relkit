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
  let child: Bun.ReadableSubprocess;
  try {
    child = Bun.spawn<"ignore", "pipe", "pipe">([executable, ...arguments_], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch {
    throw new DockerEngineError("RELKIT_DOCKER_UNAVAILABLE", "Docker is unavailable.");
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);
  let bytes = 0;
  const read = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > options.maxOutputBytes) {
        child.kill();
        throw new DockerEngineError(
          "RELKIT_DOCKER_OUTPUT_LIMIT",
          "Docker command output exceeded its safe limit.",
        );
      }
      chunks.push(next.value);
    }
    const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(output);
  };
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      read(child.stdout),
      read(child.stderr),
      child.exited,
    ]);
    if (options.signal?.aborted) cancelled();
    if (timedOut) {
      throw new DockerEngineError("RELKIT_DOCKER_COMMAND_TIMEOUT", "Docker command timed out.");
    }
    return { exitCode, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

function cancelled(): never {
  throw new DockerEngineError("RELKIT_DOCKER_CANCELLED", "Docker operation was cancelled.");
}
