import type { ExecutionContext } from "./execution-context.types.js";
export type { TracePropagation } from "@relkit/contracts";

/** Injectable source of the current execution context.
 * Tests can replace ambient scope lookup with a deterministic reader.
 * @example const layer = Layer.succeed(TraceContextReader, { current: () => context });
 */
export interface TraceContextReaderService {
  /** Reads the active context, if any.
   * @returns The active execution context or undefined.
   * @example reader.current();
   */
  readonly current: () => ExecutionContext | undefined;
}
