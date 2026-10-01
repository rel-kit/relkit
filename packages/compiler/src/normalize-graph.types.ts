import type { Effect } from "effect";
import type { canonicalizeGraphEffect } from "@relkit/graph";

/** Public graph API failure channel, preserving graph, source-path, and JSON rejections. */
export type GraphCompilationFailure = Effect.Error<ReturnType<typeof canonicalizeGraphEffect>>;
