import { FunctionInputError } from "./function-input-error.js";
import {
  deepFreeze,
  isRef,
  isStableId,
  normalizeId,
  type DescriptorMetadata,
} from "@relkit/contracts";
import {
  dispatchInvocationEffect,
  getDescriptorIdentity,
  type InvocationTarget,
} from "@relkit/invocation";
import { Effect } from "effect";
import { functionTargetForReceiverEffect } from "./define-function-validation.js";
import {
  FunctionOperationError,
  functionTry,
  observeFunction,
  runFunctionPromise,
  runFunctionSync,
} from "./function-observability.js";
import type { FunctionDependencies, FunctionRefAny } from "./types.js";
import type {
  FunctionGraphNodeDescriptor,
  FunctionGraphNodeOptions,
} from "./function-graph-node.types.js";

export type {
  FunctionAsGraphNode,
  FunctionGraphNodeDescriptor,
  FunctionGraphNodeOptions,
} from "./function-graph-node.types.js";

/** Marker identifying a frozen function graph node.
 * @example if (node[RELKIT_FUNCTION_GRAPH_NODE]) console.log(node.id);
 */
export const RELKIT_FUNCTION_GRAPH_NODE: unique symbol = Symbol.for("relkit.function-graph-node");

/** Invokes the function retained by a graph node through Effect.
 * @param target - Function captured when the node was created.
 * @param input - Graph node input.
 * @returns Effect yielding the output or a tagged dispatch failure.
 * @example Effect.runPromise(invokeFunctionGraphNodeEffect(fn, { orderId: "one" }));
 */
export const invokeFunctionGraphNodeEffect = Effect.fn("functions.function.graph-node-invoke")(
  (target: FunctionRefAny, input: unknown) =>
    observeFunction(
      "function.graph-node-invoke",
      dispatchInvocationEffect({ target: target as unknown as InvocationTarget, input }).pipe(
        Effect.mapError(
          (failure) =>
            new FunctionOperationError({
              operation: "function.graph-node-invoke",
              cause: failure.cause,
            }),
        ),
      ),
    ),
);

/** Creates a graph node view in the Effect error channel.
 * @param receiver - Method receiver, when called as a descriptor method.
 * @param fallback - Original function descriptor.
 * @param options - Optional graph node identity.
 * @returns The frozen graph node or tagged validation failure.
 * @example Effect.runSync(createFunctionGraphNodeEffect(fn, fn));
 */
export const createFunctionGraphNodeEffect = Effect.fn("functions.function.graph-node")(
  (
    receiver: unknown,
    fallback: FunctionRefAny,
    options?: FunctionGraphNodeOptions,
  ): Effect.Effect<
    FunctionGraphNodeDescriptor,
    import("./function-observability.js").FunctionOperationError
  > =>
    Effect.gen(function* () {
      const functionTarget = yield* functionTargetForReceiverEffect(receiver, fallback);
      return yield* functionTry("function.graph-node", () => {
        if (options !== undefined && !isRecord(options)) {
          throw new FunctionInputError("Function graph-node options must be an object");
        }
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
        const invokeEffect = (input: unknown) =>
          invokeFunctionGraphNodeEffect(functionTarget, input);
        Object.defineProperties(descriptor, {
          invokeEffect: {
            value: invokeEffect,
            enumerable: false,
            writable: false,
            configurable: false,
          },
          invoke: {
            value: (input: unknown) => runFunctionPromise(invokeEffect(input)),
            enumerable: false,
            writable: false,
            configurable: false,
          },
        });
        return deepFreeze(descriptor) as unknown as FunctionGraphNodeDescriptor;
      });
    }),
);

/** Creates a frozen graph node view of a function.
 * @param receiver - Method receiver.
 * @param fallback - Original function descriptor.
 * @param options - Optional graph node identity.
 * @returns The graph node view.
 * @throws TypeError for invalid options or a non-callable function.
 * @example createFunctionGraphNode(fn, fn, { id: "lookup" });
 */
export function createFunctionGraphNode(
  receiver: unknown,
  fallback: FunctionRefAny,
  options?: FunctionGraphNodeOptions,
): FunctionGraphNodeDescriptor {
  return runFunctionSync(createFunctionGraphNodeEffect(receiver, fallback, options));
}

/** Checks the shape of a graph node through Effect.
 * @param value - Candidate value.
 * @returns Effect yielding whether the candidate is a graph node.
 * @example Effect.runSync(isFunctionGraphNodeEffect(value));
 */
export const isFunctionGraphNodeEffect = Effect.fn("functions.function.is-graph-node")(
  (value: unknown) =>
    functionTry(
      "function.is-graph-node",
      () =>
        isRecord(value) &&
        value[RELKIT_FUNCTION_GRAPH_NODE] === true &&
        value.kind === "function-graph-node" &&
        isStableId(value.id) &&
        isRef(value.target, "function") &&
        !Object.hasOwn(value, "handler") &&
        typeof value.invoke === "function",
    ),
);

/** Recognizes a function graph node.
 * @param value - Candidate value.
 * @returns Whether the value is a graph node.
 * @example if (isFunctionGraphNode(value)) console.log(value.id);
 */
export function isFunctionGraphNode(value: unknown): value is FunctionGraphNodeDescriptor {
  return runFunctionSync(isFunctionGraphNodeEffect(value));
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
