/** Coordinates native graph resume requests with persisted waiting state and the invocation scope, preserving continuation failures and thread identity. This companion preserves the native input and output types without starting runtime work. */

import type { compileGraph } from "./graph-compile.js";

/** LangGraph run configuration with an optional persistent thread identity. */
export type GraphConfig = {} | { readonly configurable: { readonly thread_id: string } };

/** Compiled graph accepted by continuation helpers. */
export type CompiledGraph = ReturnType<typeof compileGraph>;
