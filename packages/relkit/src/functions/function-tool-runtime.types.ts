import type { FunctionToolHook, FunctionToolMetadata } from "./function-tool.js";
import type { FunctionRefAny } from "./types.js";

/** Runtime policy and hooks attached to a tool invoker.
 * @example const metadata: FunctionToolRuntimeMetadata = { id: "lookup", sideEffect: "read", approval: "never" };
 */
export type FunctionToolRuntimeMetadata = Pick<
  FunctionToolMetadata,
  "sideEffect" | "approval" | "timeoutMs"
> & {
  readonly id: string;
  readonly onBefore?: FunctionToolHook;
  readonly onAfter?: FunctionToolHook;
};

/** Input schema accepted by a callable function target.
 * @example const schema: TargetSchema = target.input;
 */
export type TargetSchema = FunctionRefAny["input"];
