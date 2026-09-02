export type DockerEngineErrorCode =
  | "RELKIT_DOCKER_ARGUMENT_INVALID"
  | "RELKIT_DOCKER_UNAVAILABLE"
  | "RELKIT_DOCKER_COMMAND_FAILED"
  | "RELKIT_DOCKER_COMMAND_TIMEOUT"
  | "RELKIT_DOCKER_OUTPUT_LIMIT"
  | "RELKIT_DOCKER_RESPONSE_INVALID"
  | "RELKIT_DOCKER_HEALTH_FAILED"
  | "RELKIT_DOCKER_HEALTH_TIMEOUT"
  | "RELKIT_DOCKER_CANCELLED";

export class DockerEngineError extends Error {
  constructor(
    readonly code: DockerEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DockerEngineError";
  }
}

export interface DockerCommandOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface DockerCommandRequest extends DockerCommandOptions {
  readonly maxOutputBytes: number;
}

export interface DockerCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type DockerCommandRunner = (
  command: readonly string[],
  options: DockerCommandRequest,
) => Promise<DockerCommandResult>;

export interface DockerEngineInfo {
  readonly version: string;
}

export interface DockerContainer {
  readonly id: string;
  readonly name: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly state: string;
  readonly health?: "starting" | "healthy" | "unhealthy";
  readonly ports: Readonly<Record<string, number>>;
}

export interface DockerVolume {
  readonly name: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface DockerHealthOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly signal?: AbortSignal;
}

export interface DockerClientOptions {
  readonly executable?: string;
  readonly run?: DockerCommandRunner;
  readonly maxOutputBytes?: number;
  readonly commandTimeoutMs?: number;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export interface DockerClient {
  readonly discover: (signal?: AbortSignal) => Promise<DockerEngineInfo>;
  readonly command: (
    arguments_: readonly string[],
    operation: string,
    options?: DockerCommandOptions,
  ) => Promise<string>;
  readonly containers: (
    labels?: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ) => Promise<readonly DockerContainer[]>;
  readonly volumes: (
    labels?: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ) => Promise<readonly DockerVolume[]>;
  readonly inspectContainer: (id: string, signal?: AbortSignal) => Promise<DockerContainer>;
  readonly waitForHealthy: (id: string, options?: DockerHealthOptions) => Promise<DockerContainer>;
}
