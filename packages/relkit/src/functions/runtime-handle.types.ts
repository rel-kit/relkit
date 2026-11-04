import type {
  AgentClients,
  BucketClients,
  CacheClients,
  DatabaseClients,
  EventClients,
  FunctionClients,
  JobClients,
  TaskClients,
} from "./clients.types.js";
import type { ChannelClients } from "../realtime/channel-client.types.js";
import type {
  ServiceEvents,
  ServiceFunctions,
  ServiceJobs,
  ServiceTasks,
} from "../services/index.js";

declare global {
  namespace Relkit {
    /** Generated: the application's services keyed by service ID. */
    interface HandleServices {}
    /** Generated: Drizzle services keyed by service ID. */
    interface HandleDatabases {}
    /** Generated: caches keyed by cache ID. */
    interface HandleCaches {}
    /** Generated: buckets keyed by bucket ID. */
    interface HandleBuckets {}
    /** Generated: channels keyed by channel ID. */
    interface HandleChannels {}
    /** Generated: agents keyed by agent ID. */
    interface HandleAgents {}
  }
}

type PerService<Map> = {
  readonly [Service in keyof Relkit.HandleServices & string]: Map extends "functions"
    ? FunctionClients<ServiceFunctions<Relkit.HandleServices[Service]>>
    : Map extends "events"
      ? EventClients<ServiceEvents<Relkit.HandleServices[Service]>>
      : Map extends "tasks"
        ? TaskClients<ServiceTasks<Relkit.HandleServices[Service]>>
        : JobClients<ServiceJobs<Relkit.HandleServices[Service]>>;
};

type DefaultDatabase = Relkit.ApplicationContextRegistry extends {
  readonly database: infer Database;
}
  ? Database
  : Readonly<Record<string, never>>;

/** Typed clients for an application, for code that runs outside function handlers.
 * Functions, events, tasks and jobs are grouped by service and member name; caches, buckets,
 * channels and agents are keyed by their ID.
 * @example const order = await getRelkit().functions.orders.getOrder({ orderId });
 */
export interface RelkitHandle {
  readonly functions: PerService<"functions">;
  readonly events: PerService<"events">;
  readonly tasks: PerService<"tasks">;
  readonly jobs: PerService<"jobs">;
  readonly database: DefaultDatabase;
  readonly databases: DatabaseClients<Relkit.HandleDatabases>;
  readonly cache: CacheClients<Relkit.HandleCaches>;
  readonly buckets: BucketClients<Relkit.HandleBuckets>;
  readonly channels: ChannelClients<Relkit.HandleChannels>;
  readonly agents: AgentClients<Relkit.HandleAgents>;
}

/** Calls one function of the running application on behalf of the handle. */
export type RuntimeHandleInvoke = (functionId: string, input: unknown) => Promise<unknown>;

/** What a host supplies to build an application's runtime handle. */
export interface RuntimeHandleOptions {
  /** Service descriptors keyed by service ID; their members name the handle's clients. */
  readonly services: Readonly<Record<string, unknown>>;
  /** Calls a function by ID with the application's validation, policies and telemetry. */
  readonly invoke: RuntimeHandleInvoke;
  /** Descriptors keyed by ID for clients that are not service members. */
  readonly descriptors?: Partial<
    Readonly<Record<"cache" | "buckets" | "channels" | "agents", Readonly<Record<string, unknown>>>>
  >;
  /** Provider clients keyed by dependency category and descriptor ID. */
  readonly sources?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly database?: unknown;
  readonly databases?: Readonly<Record<string, unknown>>;
}
