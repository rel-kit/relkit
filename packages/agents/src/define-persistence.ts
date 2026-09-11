import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import { normalizeId, type MaybePromise } from "@relkit/contracts";

const RELKIT_PERSISTENCE = Symbol.for("relkit.agent-persistence");

export interface PersistenceContext {
  readonly env: Readonly<Record<string, unknown>>;
}

export interface PersistenceResource<Kind extends "checkpointer" | "memory", Value> {
  readonly [RELKIT_PERSISTENCE]: true;
  readonly kind: "agent-persistence";
  readonly resource: Kind;
  readonly id: string;
  readonly ownership: "owned" | "borrowed";
  readonly acquire: (context: PersistenceContext) => Promise<Value>;
  readonly release: () => Promise<void>;
}

export type CheckpointerResource<Value extends BaseCheckpointSaver = BaseCheckpointSaver> =
  PersistenceResource<"checkpointer", Value>;
export type MemoryResource<Value extends BaseStore = BaseStore> = PersistenceResource<
  "memory",
  Value
>;

export interface PersistenceOptions<Value> {
  readonly id: string;
  readonly client: Value | ((context: PersistenceContext) => MaybePromise<Value>);
  readonly ownership?: "owned" | "borrowed";
  readonly dispose?: (value: Value) => MaybePromise<void>;
}

export function defineCheckpointerDb<Value extends BaseCheckpointSaver>(
  options: PersistenceOptions<Value>,
): CheckpointerResource<Value> {
  return buildAgentStorageResource("checkpointer", options);
}

export function defineMemoryDb<Value extends BaseStore>(
  options: PersistenceOptions<Value>,
): MemoryResource<Value> {
  return buildAgentStorageResource("memory", options);
}

export function isPersistenceResource(value: unknown): value is PersistenceResource<any, any> {
  return (
    isRecord(value) &&
    value[RELKIT_PERSISTENCE] === true &&
    value.kind === "agent-persistence" &&
    (value.resource === "checkpointer" || value.resource === "memory") &&
    typeof value.acquire === "function" &&
    typeof value.release === "function"
  );
}

export function assertPersistenceProtocol(
  resource: "checkpointer" | "memory",
  value: unknown,
): asserts value is BaseCheckpointSaver | BaseStore {
  const methods =
    resource === "checkpointer"
      ? ["getTuple", "list", "put", "putWrites", "deleteThread"]
      : ["batch"];
  if (!isRecord(value) || methods.some((method) => typeof value[method] !== "function")) {
    throw new TypeError(`${resource} resource does not implement the LangGraph protocol`);
  }
}

function buildAgentStorageResource<Kind extends "checkpointer" | "memory", Value>(
  resource: Kind,
  options: PersistenceOptions<Value>,
): PersistenceResource<Kind, Value> {
  if (!isRecord(options)) throw new TypeError("Persistence options must be an object");
  const id = normalizeId(options.id);
  const factory = typeof options.client === "function";
  const ownership = options.ownership ?? (factory ? "owned" : "borrowed");
  if (ownership === "owned" && typeof options.dispose !== "function") {
    throw new TypeError(`Owned ${resource} resource requires dispose`);
  }
  let active: Promise<Value> | undefined;
  let released = false;
  const descriptor = {
    [RELKIT_PERSISTENCE]: true as const,
    kind: "agent-persistence" as const,
    resource,
    id,
    ownership,
  };
  Object.defineProperties(descriptor, {
    acquire: {
      enumerable: false,
      value: (context: PersistenceContext) => {
        if (released) return Promise.reject(new Error(`${resource} resource "${id}" is released`));
        if (active !== undefined) return active;
        const created = factory
          ? Promise.resolve(
              (options.client as (context: PersistenceContext) => MaybePromise<Value>)(context),
            )
          : Promise.resolve(options.client as Value);
        active = created.catch((error) => {
          active = undefined;
          throw error;
        });
        return active;
      },
    },
    release: {
      enumerable: false,
      value: async () => {
        if (released) return;
        released = true;
        if (ownership !== "owned" || active === undefined) return;
        await options.dispose!(await active);
      },
    },
  });
  return Object.freeze(descriptor) as unknown as PersistenceResource<Kind, Value>;
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
