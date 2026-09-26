import type { MaybePromise, DescriptorBase, DescriptorMetadata } from "@relkit/contracts";
import type { InferInput, InferOutput, SchemaValidator } from "@relkit/schema";
import type { Effect } from "effect";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionOperationError } from "./function-observability.js";
import type {
  FunctionToolApprovalDeniedFailure,
  FunctionToolApprovalRequiredFailure,
  FunctionToolArgumentFailure,
  FunctionToolCancelledFailure,
} from "./function-tool-failures.js";
import type { FunctionRef, FunctionRefAny } from "./types.js";
import type { FunctionContext } from "./function-context.types.js";

/** Bounded side effect category for a tool.
 * @example const effect: FunctionToolSideEffect = "read";
 */
export type FunctionToolSideEffect = "none" | "read" | "write" | "external";
/** Approval policy applied before tool dispatch.
 * @example const policy: FunctionToolApproval = "on-write";
 */
export type FunctionToolApproval = "never" | "on-write" | "always";
/** Display and policy metadata for a tool.
 * @example const metadata: FunctionToolMetadata = { description: "Lookup", sideEffect: "read", approval: "never" };
 */
export interface FunctionToolMetadata extends DescriptorMetadata {
  readonly description: string;
  readonly sideEffect: FunctionToolSideEffect;
  readonly approval: FunctionToolApproval;
  readonly timeoutMs?: number;
  readonly mcp?: boolean;
}
/** Restricted invocation context passed to tool hooks.
 * @example const time = context.time;
 */
export type FunctionToolContext = Pick<
  FunctionContext,
  "invocation" | "signal" | "env" | "log" | "time"
>;
/** Optional input or output transform for a tool.
 * @param value - Validated input or output.
 * @param context - Restricted invocation context.
 * @returns Transformed value, synchronously or asynchronously.
 * @example const hook: FunctionToolHook<string> = (value) => value.trim();
 */
export type FunctionToolHook<Value = unknown> = (
  value: Value,
  context: FunctionToolContext,
) => MaybePromise<Value>;
/** Options used when creating a tool view.
 * @example const options: FunctionToolOptions = { description: "Lookup", sideEffect: "read", approval: "never" };
 */
export interface FunctionToolOptions<
  Id extends string = string,
  Input = unknown,
  Output = unknown,
> extends FunctionToolMetadata {
  readonly id?: Id;
  readonly onBefore?: FunctionToolHook<Input>;
  readonly onAfter?: FunctionToolHook<Output>;
}
/** Request shown to an approval resolver.
 * @example const request: FunctionToolApprovalRequest = { toolId: "orders.lookup", sideEffect: "read", policy: "always" };
 */
export interface FunctionToolApprovalRequest {
  readonly toolId: string;
  readonly sideEffect: FunctionToolSideEffect;
  readonly policy: FunctionToolApproval;
}
/** Decision returned by an approval resolver.
 * @example const decision: FunctionToolApprovalDecision = "approved";
 */
export type FunctionToolApprovalDecision = "approved" | "denied" | boolean;
/** Callback that decides whether a tool may execute.
 * @param approval - Tool identity and policy awaiting approval.
 * @param signal - Optional cancellation signal for pending approval work.
 * @returns Approval or denial, synchronously or asynchronously.
 * @example const approve: FunctionToolApprovalResolver = async () => "approved";
 */
export type FunctionToolApprovalResolver = (
  approval: FunctionToolApprovalRequest,
  signal?: AbortSignal,
) => MaybePromise<FunctionToolApprovalDecision>;
/** Per-call signal and approval resolver.
 * @example await tool.invoke(input, { signal: controller.signal });
 */
export interface FunctionToolInvokeOptions {
  readonly signal?: AbortSignal;
  readonly approval?: FunctionToolApprovalResolver;
}
/** Function contract copied into a tool view.
 * @example const target: FunctionToolTarget<typeof fn> = tool.target;
 */
export type FunctionToolTarget<Target extends FunctionRefAny> = FunctionRef<
  Target["ref"]["id"],
  Target extends { readonly __input?: infer Input } ? Input : unknown,
  Target extends { readonly __output?: infer Output } ? Output : unknown,
  TargetErrors<Target>,
  Target["input"],
  Target["output"]
>;
/** Frozen tool descriptor with a Promise invoke adapter.
 * @example const tool: FunctionToolDescriptor<"lookup", typeof fn> = createFunctionTool(options);
 */
export interface FunctionToolDescriptor<
  Id extends string,
  Target extends FunctionRefAny = FunctionRefAny,
> extends DescriptorBase<"tool", Id> {
  readonly ref: { readonly kind: "tool"; readonly id: Id };
  readonly target: FunctionToolTarget<Target>;
  readonly description: string;
  readonly sideEffect: FunctionToolSideEffect;
  readonly approval: FunctionToolApproval;
  readonly timeoutMs?: number;
  readonly mcp: boolean;
  readonly onBefore?: FunctionToolHook<InferInput<Target["input"]>>;
  readonly onAfter?: FunctionToolHook<InferOutput<Target["output"]>>;
  /** Invokes the target using services supplied when the Effect runs.
   * @param input - Tool argument value.
   * @param options - Optional cancellation and approval controls.
   * @returns Validated output or a tagged tool failure.
   * @example yield* tool.invokeEffect({ id: "one" });
   */
  readonly invokeEffect: (
    input: InferInput<Target["input"]>,
    options?: FunctionToolInvokeOptions,
  ) => Effect.Effect<
    InferOutput<Target["output"]>,
    | FunctionOperationError
    | FunctionToolArgumentFailure
    | FunctionToolCancelledFailure
    | FunctionToolApprovalRequiredFailure
    | FunctionToolApprovalDeniedFailure,
    SchemaValidator
  >;
  /** Invokes the target through the common tool and function runtime.
   * @param input - Tool argument value.
   * @param options - Optional cancellation and approval controls.
   * @returns Validated output, rejecting with a tool error on failure.
   * @example await tool.invoke({ id: "one" });
   */
  readonly invoke: (
    input: InferInput<Target["input"]>,
    options?: FunctionToolInvokeOptions,
  ) => Promise<InferOutput<Target["output"]>>;
}
/** Target and metadata required to construct a tool.
 * @example const options: FunctionToolCreateOptions<"lookup", typeof fn> = { id: "lookup", target: fn, description: "Lookup", sideEffect: "read", approval: "never" };
 */
export type FunctionToolCreateOptions<
  Id extends string,
  Target extends FunctionRefAny,
> = FunctionToolOptions<Id, InferInput<Target["input"]>, InferOutput<Target["output"]>> & {
  readonly id?: Id;
  readonly target: Target;
};
type TargetErrors<Target extends FunctionRefAny> =
  NonNullable<Target["errors"]> extends readonly ErrorDescriptorAny[]
    ? NonNullable<Target["errors"]>
    : readonly ErrorDescriptorAny[];
