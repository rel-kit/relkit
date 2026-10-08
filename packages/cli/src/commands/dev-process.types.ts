import type { Effect } from "effect";

/** Inspector child inputs, isolated from the backend generation's private port. */
export interface DevInspectorOptions {
  readonly command: readonly string[];
  readonly hostname?: string;
  readonly port?: number;
  readonly cwd?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly maxOutputBytes?: number;
  readonly stopTimeoutMs?: number;
}
/** Existing manually owned inspector facade; native cores use scoped acquisition. */
export interface DevInspector {
  readonly port: number;
  readonly process: Bun.ReadableSubprocess;
  readonly output: Promise<void>;
  /**
   * Stops the child and joins both output readers before resolving.
   * @returns Shared native child/output cleanup completion.
   */
  readonly stop: () => Promise<void>;
}

/** Native inspector owner; release and output workers retain no hidden environment. */
export interface EffectDevInspector {
  readonly port: number;
  readonly process: Bun.ReadableSubprocess;
  /** Joins the already acquired scoped output reader fibers. */
  readonly output: Effect.Effect<void>;
  /** Stops and reaps the owned child, then joins output with bounded deadlines. */
  readonly stop: Effect.Effect<void>;
}
