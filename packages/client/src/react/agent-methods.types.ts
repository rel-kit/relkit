import type { AgentThreadOptions } from "./agent-hook-types.types.js";

/** Borrowed agent submission callback preserving its declared receipt Promise. */
export type Invoke = (
  kind: string,
  payload: unknown,
  options: AgentThreadOptions & { readonly resume?: boolean },
) => Promise<void>;
