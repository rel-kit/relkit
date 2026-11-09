import type { InvocationDispatchOptions } from "./dispatcher.types.js";
export type { InvocationParent } from "./contracts.js";

/** Timeout inputs accepted by standalone deadline calculation.
 * The earlier of the absolute deadline and relative timeout wins.
 * @example const options: DeadlineOptions = { timeoutMs: 1_000 };
 */
export type DeadlineOptions = Pick<InvocationDispatchOptions, "deadlineMs" | "timeoutMs">;
