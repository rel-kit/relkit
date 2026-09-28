import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import { normalizeId, type MaybePromise } from "@relkit/contracts";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { RELKIT_PERSISTENCE } from "./persistence-symbol.js";
import { agentPersistenceFailure } from "./persistence-error.js";
import type {
  CheckpointerResource,
  MemoryResource,
  PersistenceContext,
  PersistenceOptions,
  PersistenceResource,
} from "./define-persistence.types.js";

export type * from "./define-persistence.types.js";
export {
  assertPersistenceProtocol,
  assertPersistenceProtocolEffect,
  isPersistenceResource,
  isPersistenceResourceEffect,
} from "./define-persistence-guards.js";

/** Defines a lazily acquired checkpointer resource.
 * @param options - Identity, client factory, ownership, and disposal policy.
 * @returns An Effect with a resource descriptor or AgentPersistenceFailure.
 * @example Effect.runSync(defineCheckpointerDbEffect({ id: "db", client: saver }));
 */
export const defineCheckpointerDbEffect = Effect.fn("Agents.persistence.defineCheckpointer")(
  <Value extends BaseCheckpointSaver>(options: PersistenceOptions<Value>) =>
    Effect.try({
      try: () => buildAgentStorageResource("checkpointer", options),
      catch: agentPersistenceFailure,
    }),
  (effect) => observeAgent("persistence.define-checkpointer", effect),
);

/** Defines a checkpointer for existing synchronous authoring callers.
 * @param options - Identity, client factory, ownership, and disposal policy.
 * @returns A lazily acquired resource descriptor.
 * @throws The original invalid options error.
 * @example const resource = defineCheckpointerDb({ id: "db", client: saver });
 */
export function defineCheckpointerDb<Value extends BaseCheckpointSaver>(
  options: PersistenceOptions<Value>,
): CheckpointerResource<Value> {
  return Effect.runSync(
    defineCheckpointerDbEffect(options).pipe(
      Effect.catchTag("AgentPersistenceFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Defines a lazily acquired memory store resource.
 * @param options - Identity, client factory, ownership, and disposal policy.
 * @returns An Effect with a resource descriptor or AgentPersistenceFailure.
 * @example Effect.runSync(defineMemoryDbEffect({ id: "memory", client: store }));
 */
export const defineMemoryDbEffect = Effect.fn("Agents.persistence.defineMemory")(
  <Value extends BaseStore>(options: PersistenceOptions<Value>) =>
    Effect.try({
      try: () => buildAgentStorageResource("memory", options),
      catch: agentPersistenceFailure,
    }),
  (effect) => observeAgent("persistence.define-memory", effect),
);

/** Defines a memory store for existing synchronous authoring callers.
 * @param options - Identity, client factory, ownership, and disposal policy.
 * @returns A lazily acquired resource descriptor.
 * @throws The original invalid options error.
 * @example const resource = defineMemoryDb({ id: "memory", client: store });
 */
export function defineMemoryDb<Value extends BaseStore>(
  options: PersistenceOptions<Value>,
): MemoryResource<Value> {
  return Effect.runSync(
    defineMemoryDbEffect(options).pipe(
      Effect.catchTag("AgentPersistenceFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
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
        let created: Promise<Value>;
        try {
          created = factory
            ? Promise.resolve(
                (options.client as (context: PersistenceContext) => MaybePromise<Value>)(context),
              )
            : Promise.resolve(options.client as Value);
        } catch (error) {
          created = Promise.reject(error);
        }
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
