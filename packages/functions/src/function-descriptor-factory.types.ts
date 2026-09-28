import type { DescriptorMetadata } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionDependencies } from "./types.js";
import type { FunctionToolMetadata } from "./function-tool.js";

/** Inputs for a function descriptor shared by authoring packages.
 * @example createFunctionDescriptor({ id: "orders.get", input, output, invocationMode: "callable", handler });
 */
export interface FunctionDescriptorFactoryOptions extends DescriptorMetadata {
  readonly id: string;
  readonly input: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly progress?: StandardSchemaV1;
  readonly invocationMode: "callable" | "event-only";
  readonly handler: (...args: any[]) => unknown;
  readonly errors?: readonly ErrorDescriptorAny[];
  readonly dependencies?: FunctionDependencies;
  readonly publishes?: readonly string[];
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly tool?: FunctionToolMetadata;
  readonly onBefore?: (...args: any[]) => unknown;
  readonly onAfter?: (...args: any[]) => unknown;
  readonly descriptorFields?: Readonly<Record<string, unknown>>;
}
