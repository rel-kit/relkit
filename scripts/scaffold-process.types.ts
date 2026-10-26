/** Describes exact native commands and scoped child output for packaged scaffold acceptance. */
import type { Effect, Schema } from "effect";
import type { ScaffoldProcessFailure } from "./scaffold-process.errors.js";

/** Exact finite child authority; registry/cache/environment overrides belong only to this child. */
export interface ScaffoldCommand {
  /** Closed native executable selection; Bun is default, with scoped Node, Git and browser commands. */
  readonly executable?: "bun" | "node" | "git" | "agent-browser";
  /** Literal argument vector passed without shell interpolation. */
  readonly args: readonly string[];
  /** Caller-owned working directory. */
  readonly cwd: string;
  /** Optional private registry used for this candidate installation. */
  readonly registry?: string;
  /** Optional isolated Bun install cache. */
  readonly cacheDir?: string;
  /** Child-only environment overrides merged with the native process environment. */
  readonly env?: Readonly<Record<string, string>>;
}
/** Scoped child whose complete exit and both output drains are joined before fixture cleanup. */
export interface ScaffoldChild {
  /** Detached native process whose group was created by this owner. */
  readonly process: Bun.ReadableSubprocess;
  /** Observed complete bounded standard output. */
  readonly stdout: Promise<string>;
  /** Observed complete bounded standard error. */
  readonly stderr: Promise<string>;
  /** Current bounded diagnostic display while the child is active. */
  readonly output: () => string;
  /** Immediate native rejection observation and full exit/output join owned by this child. */
  readonly settled: Promise<
    readonly [
      PromiseSettledResult<number>,
      PromiseSettledResult<string>,
      PromiseSettledResult<string>,
    ]
  >;
  /** Idempotent native termination and joined release, retaining failed drain evidence. */
  readonly release: () => Promise<void>;
}
/** Native package manifest JSON retaining precise fields required by the packed registry adapter. */
export type Manifest = Readonly<Record<string, Schema.Json>> & {
  /** Actual published package identity. */
  readonly name: string;
  /** Exact first-party candidate version. */
  readonly version: string;
  /** Native runtime dependency specifiers preserved in the packed manifest. */
  readonly dependencies?: Record<string, string>;
  /** Development workspace owners required by isolated native packing. */
  readonly devDependencies?: Record<string, string>;
  /** Optional workspace declarations preserved during packing. */
  readonly optionalDependencies?: Record<string, string>;
  /** Native peer declarations, including workspace peers resolved before packing. */
  readonly peerDependencies?: Record<string, string>;
};
/** Sorted portable file paths mapped to exact permission bits and normalized text or base64 binary bytes. */
export type ProjectSnapshot = Record<string, { readonly mode: number; readonly content: string }>;

/** Recursively inventories exact project bytes and modes using joined native reads. */
export type ProjectSnapshotOperation = (
  root: string,
  current?: string,
  includeRuntime?: boolean,
) => Effect.Effect<ProjectSnapshot, ScaffoldProcessFailure>;
