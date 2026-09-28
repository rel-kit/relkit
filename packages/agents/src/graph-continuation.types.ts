import type { compileGraph } from "./graph-compile.js";

/** LangGraph run configuration with an optional persistent thread identity. */
export type GraphConfig = {} | { readonly configurable: { readonly thread_id: string } };

/** Compiled graph accepted by continuation helpers. */
export type CompiledGraph = ReturnType<typeof compileGraph>;
