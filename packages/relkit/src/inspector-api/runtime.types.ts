import type { RUNTIME_COLLECTIONS } from "./runtime.js";

/** Runtime collection vocabulary derived from the declared public collection constant. */
export type RuntimeCollection = (typeof RUNTIME_COLLECTIONS)[number];
