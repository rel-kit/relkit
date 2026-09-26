import type {
  FunctionRefAny,
  FunctionToolApproval,
  FunctionToolApprovalDecision,
  FunctionToolApprovalRequest,
  FunctionToolApprovalResolver,
  FunctionToolDescriptor,
  FunctionToolInvokeOptions,
  FunctionToolMetadata,
  FunctionToolSideEffect,
  FunctionToolTarget,
} from "@relkit/functions";

/** Effect policy inherited from a function tool. */
export type ToolSideEffect = FunctionToolSideEffect;
/** Approval policy inherited from a function tool. */
export type ToolApproval = FunctionToolApproval;
/** Decision returned by a tool approval resolver. */
export type ToolApprovalDecision = FunctionToolApprovalDecision;
/** Request passed to a tool approval resolver. */
export type ToolApprovalRequest = FunctionToolApprovalRequest;
/** Resolver for tool approval requests. */
export type ToolApprovalResolver = FunctionToolApprovalResolver;
/** Options for invoking the function view of a tool. */
export type ToolInvokeOptions = FunctionToolInvokeOptions;

/** Stable reference to a tool descriptor.
 * @example const ref: ToolRef<"orders.lookup"> = { ref: { kind: "tool", id: "orders.lookup" } };
 */
export interface ToolRef<Id extends string = string> {
  readonly ref: { readonly kind: "tool"; readonly id: Id };
}

/** Any stable tool reference. */
export type ToolRefAny = ToolRef;
/** Validated function target copied into a tool.
 * @example const copied: ToolTarget<typeof target> = copyFunctionTarget(target);
 */
export type ToolTarget<Target extends FunctionRefAny> = FunctionToolTarget<Target>;
/** Frozen, handler-free tool descriptor.
 * @example const descriptor: ToolDescriptor<"orders.lookup.tool"> = defineTool(options);
 */
export type ToolDescriptor<
  Id extends string,
  Target extends FunctionRefAny = FunctionRefAny,
> = FunctionToolDescriptor<Id, Target>;

/** Authoring options for a handler-free tool view.
 * @example const options: DefineToolOptions<"orders.lookup", typeof target> = { id: "orders.lookup", target, description: "Read an order", sideEffect: "read", approval: "never" };
 */
export interface DefineToolOptions<
  Id extends string,
  Target extends FunctionRefAny,
> extends FunctionToolMetadata {
  readonly id?: Id;
  readonly target: Target;
  readonly onBefore?: import("@relkit/functions").FunctionToolHook<
    import("@relkit/schema").InferInput<Target["input"]>
  >;
  readonly onAfter?: import("@relkit/functions").FunctionToolHook<
    import("@relkit/schema").InferOutput<Target["output"]>
  >;
}
