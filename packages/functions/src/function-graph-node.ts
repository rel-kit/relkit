import {
  deepFreeze,
  isRef,
  isStableId,
  normalizeId,
  type DescriptorMetadata,
  type Ref,
} from "@relkit/contracts";
import {
  dispatchInvocation,
  getDescriptorIdentity,
  type InvocationTarget,
} from "@relkit/invocation";
import type { InferInput, StandardSchemaV1 } from "@relkit/schema";
import type { ErrorDescriptorAny } from "./define-error.js";
import { functionTargetForReceiver } from "./define-function-validation.js";
import type { FunctionDependencies, FunctionRefAny } from "./types.js";

export const RELKIT_FUNCTION_GRAPH_NODE: unique symbol = Symbol.for("relkit.function-graph-node");

export interface FunctionGraphNodeOptions<Id extends string = string> {
  readonly id?: Id;
}

export interface FunctionGraphNodeDescriptor<
  Id extends string = string,
  FunctionId extends string = string,
  Input = unknown,
  Output = unknown,
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
  Dependencies extends FunctionDependencies = FunctionDependencies,
> extends DescriptorMetadata {
  readonly [RELKIT_FUNCTION_GRAPH_NODE]: true;
  readonly kind: "function-graph-node";
  readonly id: Id;
  readonly target: Ref<"function", FunctionId>;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly errors?: Errors;
  readonly dependencies?: Dependencies;
  readonly invoke: (input: InferInput<InputSchema>) => Promise<Output>;
  readonly __input?: Input;
  readonly __output?: Output;
}

export type FunctionAsGraphNode<
  FunctionId extends string,
  Input,
  Output,
  Errors extends readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Dependencies extends FunctionDependencies,
> = {
  <const NodeId extends string>(
    options: FunctionGraphNodeOptions<NodeId> & { readonly id: NodeId },
  ): FunctionGraphNodeDescriptor<
    NodeId,
    FunctionId,
    Input,
    Output,
    Errors,
    InputSchema,
    OutputSchema,
    Dependencies
  >;
  (): FunctionGraphNodeDescriptor<
    FunctionId,
    FunctionId,
    Input,
    Output,
    Errors,
    InputSchema,
    OutputSchema,
    Dependencies
  >;
};

export function createFunctionGraphNode(
  receiver: unknown,
  fallback: FunctionRefAny,
  options?: FunctionGraphNodeOptions,
): FunctionGraphNodeDescriptor {
  if (options !== undefined && !isRecord(options)) {
    throw new TypeError("Function graph-node options must be an object");
  }
  const functionTarget = functionTargetForReceiver(receiver, fallback);
  const functionId = getDescriptorIdentity(functionTarget);
  const id = normalizeId(options?.id ?? functionId);
  const source = functionTarget as FunctionRefAny &
    DescriptorMetadata & { readonly dependencies?: FunctionDependencies };
  const descriptor = {
    [RELKIT_FUNCTION_GRAPH_NODE]: true as const,
    kind: "function-graph-node" as const,
    id,
    target: Object.freeze({ kind: "function" as const, id: functionId }),
    input: functionTarget.input,
    output: functionTarget.output,
    ...(source.errors === undefined ? {} : { errors: source.errors }),
    ...copyOptionalField(source, "dependencies"),
    ...copyOptionalField(source, "title"),
    ...copyOptionalField(source, "description"),
    ...copyOptionalField(source, "tags"),
  };
  Object.defineProperty(descriptor, "invoke", {
    value: (input: unknown) =>
      dispatchInvocation({
        target: functionTarget as unknown as InvocationTarget,
        input,
      }),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return deepFreeze(descriptor) as unknown as FunctionGraphNodeDescriptor;
}

export function isFunctionGraphNode(value: unknown): value is FunctionGraphNodeDescriptor {
  return (
    isRecord(value) &&
    value[RELKIT_FUNCTION_GRAPH_NODE] === true &&
    value.kind === "function-graph-node" &&
    isStableId(value.id) &&
    isRef(value.target, "function") &&
    !Object.hasOwn(value, "handler") &&
    typeof value.invoke === "function"
  );
}

function copyOptionalField<T extends object, Key extends keyof T>(
  value: T,
  key: Key,
): {} | Pick<T, Key> {
  return value[key] === undefined ? {} : ({ [key]: value[key] } as Pick<T, Key>);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
