import type { LoggerOptions } from "@relkit/runtime-effect";
import type {
  CandidateCompile,
  StartedCandidate,
  SupervisorObservabilityOptions,
} from "@relkit/supervisor";
import { DevSession } from "./dev-session.js";
import type { DevInspectorOptions } from "./dev-process.js";

export interface DevLogEvent {
  readonly level: "info" | "warn" | "error";
  readonly event: string;
  readonly fields?: Readonly<Record<string, string | number | boolean>>;
}
export type DevLog = (event: DevLogEvent) => void;
export type DevGraphHash = string | ((candidate: StartedCandidate) => string | PromiseLike<string>);

export interface DevOptions {
  readonly projectRoot?: string;
  readonly compile: CandidateCompile;
  readonly graphHash?: DevGraphHash;
  readonly hostname?: string;
  readonly candidateHostname?: string;
  readonly stablePort?: number;
  readonly generatedDirectory?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly maxStartupOutputBytes?: number;
  readonly candidateStopTimeoutMs?: number;
  readonly healthTimeoutMs?: number;
  readonly drainTimeoutMs?: number;
  readonly inspector?: DevInspectorOptions | false;
  readonly spawn?: typeof Bun.spawn;
  readonly signal?: AbortSignal;
  readonly installSignalHandlers?: boolean;
  readonly logger?: Omit<LoggerOptions, "component">;
  readonly onLog?: DevLog;
  readonly observability?: Omit<SupervisorObservabilityOptions, "graphHash">;
}

export { DevSession } from "./dev-session.js";

export async function startDev(options: DevOptions): Promise<DevSession> {
  return new DevSession(options).start();
}

export async function runDev(options: DevOptions): Promise<void> {
  const session = await startDev(options);
  await session.waitForShutdown();
}
