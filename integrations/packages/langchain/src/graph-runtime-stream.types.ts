/** Acquired native stream and public sinks retained by one graph invocation. */
import type { compileGraph } from "./graph-compile.js";
import type { GraphConfig } from "./graph-continuation.types.js";
import type { GraphRuntimeOptions } from "./graph-runtime.types.js";
export interface CompiledGraphStreamContext {
  readonly options: GraphRuntimeOptions;
  readonly graph: ReturnType<typeof compileGraph>;
  readonly config: GraphConfig;
  readonly signal: AbortSignal;
  readonly maxOutputBytes: number;
  readonly run: Awaited<ReturnType<ReturnType<typeof compileGraph>["streamEvents"]>>;
}
