import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import type { MaybePromise } from "@relkit/contracts";
import type { RELKIT_PERSISTENCE } from "./persistence-symbol.js";

/** Environment made available while acquiring persistence. */
export interface PersistenceContext {
  readonly env: Readonly<Record<string, unknown>>;
}

/** Lazily acquired, explicitly released persistence descriptor. */
export interface PersistenceResource<Kind extends "checkpointer" | "memory", Value> {
  readonly [RELKIT_PERSISTENCE]: true;
  readonly kind: "agent-persistence";
  readonly resource: Kind;
  readonly id: string;
  readonly ownership: "owned" | "borrowed";
  readonly acquire: (context: PersistenceContext) => Promise<Value>;
  readonly release: () => Promise<void>;
}

/** Checkpointer resource passed to a LangGraph runtime. */
export type CheckpointerResource<Value extends BaseCheckpointSaver = BaseCheckpointSaver> =
  PersistenceResource<"checkpointer", Value>;
/** Memory store resource passed to a LangGraph runtime. */
export type MemoryResource<Value extends BaseStore = BaseStore> = PersistenceResource<"memory", Value>;

/** Acquisition and disposal configuration for an agent persistence resource. */
export interface PersistenceOptions<Value> {
  readonly id: string;
  readonly client: Value | ((context: PersistenceContext) => MaybePromise<Value>);
  readonly ownership?: "owned" | "borrowed";
  readonly dispose?: (value: Value) => MaybePromise<void>;
}
