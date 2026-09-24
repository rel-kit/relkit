import type { JsonValue } from "@relkit/contracts";
import type { GraphNodeBase, GraphTriggerType } from "./model.types.js";

/** Ordered middleware reference projected on an HTTP route.
 * @example function inspect(value: MiddlewareRouteRef): void { console.log(value); }
 */
export interface MiddlewareRouteRef {
  readonly id: string;
  readonly path: string;
  readonly order: number;
  readonly match: "always" | "conditional";
}
/** Named request or response transform projected on an HTTP route.
 * @example function inspect(value: TransformProjection): void { console.log(value); }
 */
export interface TransformProjection {
  readonly id: string;
  readonly schema: JsonValue;
}
/** HTTP route configuration emitted by the compiler.
 * @example function inspect(value: HttpTriggerConfig): void { console.log(value); }
 */
export interface HttpTriggerConfig {
  readonly method: string;
  readonly path: string;
  readonly rawHandler?: boolean;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly runtimePaths?: readonly string[];
  readonly request: JsonValue;
  readonly responses: JsonValue;
  readonly middleware: readonly MiddlewareRouteRef[];
  readonly transforms: readonly TransformProjection[];
  readonly rateLimit?: {
    readonly limit: number;
    readonly windowMs: number;
    readonly key: JsonValue;
    readonly storeId?: string;
  };
  readonly maxBodyBytes?: number;
  readonly timeoutMs?: number;
  readonly client?: false | { readonly operation: "query" | "mutation" };
  readonly stream?: { readonly format: "sse" | "text" | "bytes" };
}
/** Exact event trigger and delivery configuration.
 * @example function inspect(value: EventTriggerConfig): void { console.log(value); }
 */
export interface EventTriggerConfig {
  readonly eventId: string;
  readonly eventVersion: number;
  readonly delivery: "ephemeral" | "durable";
  readonly profile?: string;
  readonly retry?: JsonValue;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
}
/** Graph node that binds a trigger to a function.
 * @example function inspect(value: TriggerNode<"http">): void { console.log(value); }
 */
export interface TriggerNode<
  Trigger extends GraphTriggerType = GraphTriggerType,
  Config = JsonValue,
> extends GraphNodeBase<"trigger"> {
  readonly triggerType: Trigger;
  readonly targetFunctionId: string;
  readonly config: Config;
}
