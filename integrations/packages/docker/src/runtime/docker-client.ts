import { parseContainers, parseVolumes } from "./docker-inspect.js";
import { healthTimeout, wait } from "./docker-health.js";
import { dockerCommandRunner } from "./docker-runner.js";
import {
  DockerEngineError,
  type DockerClient,
  type DockerClientOptions,
  type DockerCommandOptions,
} from "./docker-types.js";
import {
  cancelled,
  invalidResponse,
  labelFilters,
  optionalSignal,
  positive,
  requiredText,
  resourceLines,
  responseText,
  validateArguments,
  validateResourceId,
} from "./docker-validation.js";

const DEFAULT_OUTPUT_LIMIT = 1024 * 1024;

export function createDockerClient(options: DockerClientOptions = {}): DockerClient {
  if (options.executable !== undefined) requiredText(options.executable, "Docker executable");
  const maxOutputBytes = positive(options.maxOutputBytes ?? DEFAULT_OUTPUT_LIMIT, "maxOutputBytes");
  const commandTimeoutMs = positive(options.commandTimeoutMs ?? 15_000, "commandTimeoutMs");
  const run = options.run ?? dockerCommandRunner(options.executable);
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? wait;
  const command: DockerClient["command"] = async (arguments_, operation, commandOptions = {}) => {
    validateArguments(arguments_);
    requiredText(operation, "Docker operation");
    const timeoutMs = positive(commandOptions.timeoutMs ?? commandTimeoutMs, "timeoutMs");
    try {
      const result = await run(arguments_, {
        maxOutputBytes,
        timeoutMs,
        ...(commandOptions.signal === undefined ? {} : { signal: commandOptions.signal }),
      });
      if (
        new TextEncoder().encode(result.stdout).byteLength +
          new TextEncoder().encode(result.stderr).byteLength >
        maxOutputBytes
      ) {
        throw new DockerEngineError(
          "RELKIT_DOCKER_OUTPUT_LIMIT",
          "Docker command output exceeded its safe limit.",
        );
      }
      if (result.exitCode !== 0) {
        throw new DockerEngineError(
          "RELKIT_DOCKER_COMMAND_FAILED",
          `${operation} failed with exit code ${result.exitCode}.`,
        );
      }
      return result.stdout.trim();
    } catch (error) {
      if (error instanceof DockerEngineError) throw error;
      if (commandOptions.signal?.aborted) {
        throw new DockerEngineError("RELKIT_DOCKER_CANCELLED", "Docker operation was cancelled.");
      }
      throw new DockerEngineError("RELKIT_DOCKER_UNAVAILABLE", "Docker is unavailable.");
    }
  };

  const inspect = async (id: string, commandOptions: DockerCommandOptions) => {
    validateResourceId(id);
    const output = await command(
      ["container", "inspect", id],
      "Docker container inspection",
      commandOptions,
    );
    const containers = parseContainers(output);
    if (containers.length !== 1) invalidResponse();
    return containers[0]!;
  };
  const inspectContainer: DockerClient["inspectContainer"] = (id, signal) =>
    inspect(id, optionalSignal(signal));

  const client: DockerClient = {
    discover: async (signal) => {
      const output = await command(
        ["version", "--format", "{{json .Server}}"],
        "Docker engine discovery",
        optionalSignal(signal),
      );
      try {
        const value = JSON.parse(output) as Record<string, unknown>;
        return Object.freeze({ version: responseText(value.Version) });
      } catch (error) {
        if (error instanceof DockerEngineError) throw error;
        return invalidResponse();
      }
    },
    command,
    containers: async (labels, signal) => {
      const ids = resourceLines(
        await command(
          ["container", "ls", "--all", "--quiet", ...labelFilters(labels)],
          "Docker container listing",
          optionalSignal(signal),
        ),
      );
      if (ids.length === 0) return Object.freeze([]);
      return parseContainers(
        await command(
          ["container", "inspect", ...ids],
          "Docker container inspection",
          optionalSignal(signal),
        ),
      );
    },
    volumes: async (labels, signal) => {
      const names = resourceLines(
        await command(
          ["volume", "ls", "--quiet", ...labelFilters(labels)],
          "Docker volume listing",
          optionalSignal(signal),
        ),
      );
      if (names.length === 0) return Object.freeze([]);
      return parseVolumes(
        await command(
          ["volume", "inspect", ...names],
          "Docker volume inspection",
          optionalSignal(signal),
        ),
      );
    },
    inspectContainer,
    waitForHealthy: async (id, healthOptions = {}) => {
      const timeoutMs = positive(healthOptions.timeoutMs ?? 60_000, "health timeoutMs");
      const pollIntervalMs = positive(healthOptions.pollIntervalMs ?? 250, "health pollIntervalMs");
      const deadline = now() + timeoutMs;
      while (true) {
        if (healthOptions.signal?.aborted) cancelled();
        const remaining = deadline - now();
        if (remaining <= 0) healthTimeout(id);
        let container;
        try {
          container = await inspect(id, {
            timeoutMs: Math.min(commandTimeoutMs, remaining),
            ...(healthOptions.signal === undefined ? {} : { signal: healthOptions.signal }),
          });
        } catch (error) {
          if (
            error instanceof DockerEngineError &&
            error.code === "RELKIT_DOCKER_COMMAND_TIMEOUT"
          ) {
            healthTimeout(id);
          }
          throw error;
        }
        if (container.health === "healthy") return container;
        if (
          container.health === "unhealthy" ||
          container.state === "exited" ||
          container.state === "dead"
        ) {
          throw new DockerEngineError(
            "RELKIT_DOCKER_HEALTH_FAILED",
            `Docker container "${id}" became unhealthy.`,
          );
        }
        if (container.health === undefined) invalidResponse();
        const sleepFor = deadline - now();
        if (sleepFor <= 0) healthTimeout(id);
        await sleep(Math.min(pollIntervalMs, sleepFor), healthOptions.signal);
      }
    },
  };
  return Object.freeze(client);
}

export { randomLoopbackPort } from "./docker-health.js";
