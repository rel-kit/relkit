/** Fixed operation names keep trace and metric dimensions bounded. */
export type ContractOperation =
  | "activation.validate"
  | "id.normalize"
  | "id.is-stable"
  | "id.assert-stable"
  | "id.normalize-protocol"
  | "id.is-protocol"
  | "id.to-graph-hash"
  | "id.to-generation-id"
  | "id.to-request-id"
  | "id.to-trace-id"
  | "id.to-invocation-id"
  | "id.to-event-instance-id"
  | "json.is-primitive"
  | "json.is-value"
  | "json.assert-value"
  | "json.serialize"
  | "descriptor.create-ref"
  | "descriptor.is-kind"
  | "descriptor.is-ref"
  | "descriptor.assert-ref"
  | "descriptor.is-descriptor"
  | "descriptor.assert-descriptor"
  | "descriptor.create-base"
  | "descriptor.deep-freeze"
  | "runtime-integration.assert-version"
  | "source-location.normalize-path"
  | "source-location.create"
  | "source-location.normalize"
  | "source-path.parse"
  | "source-path.within"
  | "source-path.join"
  | "trace-id.validate"
  | "span-id.validate"
  | "span-id.convert"
  | "trace-id.create"
  | "span-id.create"
  | "trace-identifiers.create"
  | "trace-context.parse-parent"
  | "trace-context.parse-state"
  | "trace-context.inject"
  | "trace-context.parse-propagation";

/** Instrumentation boundary for contract operations and test Layers. */
export interface ContractTelemetryService {
  /**
   * Observes an Effect without changing its result or failure channel.
   * @param operation - Stable bounded operation name.
   * @param effect - Operation to trace and measure.
   * @returns The observed Effect with unchanged channels.
   * @example telemetry.observe("id.normalize", normalizeIdEffect("orders.get"));
   */
  readonly observe: <A, E, R>(
    operation: ContractOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
import type { Effect } from "effect";
