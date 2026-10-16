/** Native process observations shared by the environment and source recovery acceptance cycles. */
import type { recoveryProcess } from "./recovery-process.js";

/** One CLI invocation retained across every source and environment mutation. */
export type RecoveryProcess = ReturnType<typeof recoveryProcess>;
