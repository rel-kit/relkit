declare const StableIdBrand: unique symbol;
declare const ProtocolIdBrand: unique symbol;

/** A validated identifier whose value is independent of a source path. */
export type StableId = string & { readonly [StableIdBrand]: "StableId" };
/** Alias used by descriptor contracts for stable IDs. */
export type DescriptorId = StableId;
/** A stable identifier used to address a versioned protocol value. */
export type ProtocolId<Name extends string = "ProtocolId"> = StableId & {
  readonly [ProtocolIdBrand]: Name;
};

/** Nominal IDs used in protocol and graph records. */
export type GraphHash = ProtocolId<"GraphHash">;
/** Nominal identifier for a generated runtime generation. */
export type GenerationId = ProtocolId<"GenerationId">;
/** Nominal identifier for one request. */
export type RequestId = ProtocolId<"RequestId">;
/** Nominal W3C trace identifier. */
export type TraceId = ProtocolId<"TraceId">;
/** Nominal identifier for a function invocation. */
export type InvocationId = ProtocolId<"InvocationId">;
/** Nominal identifier for an event occurrence. */
export type EventInstanceId = ProtocolId<"EventInstanceId">;

/** The descriptor kinds represented by the public v3 contracts. */
export type DescriptorKind =
  | "app"
  | "function"
  | "service"
  | "route"
  | "middleware"
  | "task"
  | "job"
  | "event"
  | "event-trigger"
  | "bucket"
  | "cache"
  | "tool"
  | "agent"
  | "channel"
  | "constants"
  | "prompt";

/** A typed reference to a descriptor identified by an explicit stable ID. */
export interface Ref<Kind extends DescriptorKind, Id extends string = string> {
  readonly kind: Kind;
  readonly id: Id;
}
