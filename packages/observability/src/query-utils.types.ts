import type { ObservabilityIndex } from "./storage/index.types.js";

/** Index operations required by local query helpers. */
export type QueryIndex = Pick<ObservabilityIndex, "page" | "tracePage" | "read">;
