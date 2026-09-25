import type { StandardSchemaV1 } from "@relkit/schema";
import type {
  InvocationCallStack,
  InvocationDispatcher,
  InvocationFailure,
  InvocationParent,
  TaskAncestry,
} from "./index.js";

/** Dependencies for a standalone invocation's deferred stream lifecycle.
 * The finish callback owns the invocation until iteration completes or stops.
 * @example const stream = createStandaloneStream({ source, schema, controller, dispatcher, parent, chain, finish });
 */
export interface StandaloneStreamOptions {
  readonly source: AsyncIterable<unknown>;
  readonly schema: StandardSchemaV1;
  readonly controller: AbortController;
  readonly dispatcher: InvocationDispatcher;
  readonly parent: InvocationParent;
  readonly chain: InvocationCallStack;
  readonly taskAncestry?: TaskAncestry;
  /** Finalizes the deferred invocation after stream completion.
   * @param outcome - Stream success or normalized failure outcome.
   * @param error - Optional normalized stream failure.
   * @returns Completion of invocation hooks and release.
   * @example await options.finish("success");
   */
  readonly finish: (
    outcome: InvocationFailure["outcome"] | "success",
    error?: InvocationFailure,
  ) => Promise<void>;
}
