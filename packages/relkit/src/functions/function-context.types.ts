import type {
  PublicClock as SharedPublicClock,
  PublicLogger as SharedPublicLogger,
  PublicTrace as SharedPublicTrace,
  InvocationMetadata as SharedInvocationMetadata,
  InvocationSource as SharedInvocationSource,
} from "../invocation/index.js";
import type { ChannelClients } from "../realtime/channel-client.types.js";
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
import type {
  AgentRefAny,
  BucketRefAny,
  CacheRefAny,
  ChannelRefAny,
  DatabaseRefAny,
  EventRefAny,
  FunctionRefAny,
  JobRefAny,
  TaskRefAny,
} from "./types.js";

/** Everything a function may call, declared once; handlers reach each through `ctx.<kind>.<name>`.
 * @example const dependencies: FunctionDependencies = { functions: { priceOrder }, buckets: { uploads } };
 */
export interface FunctionDependencies {
  readonly functions?: Readonly<Record<string, FunctionRefAny>>;
  readonly events?: Readonly<Record<string, EventRefAny>>;
  readonly channels?: Readonly<Record<string, ChannelRefAny>>;
  readonly databases?: Readonly<Record<string, DatabaseRefAny>>;
  readonly tasks?: Readonly<Record<string, TaskRefAny>>;
  readonly jobs?: Readonly<Record<string, JobRefAny>>;
  readonly buckets?: Readonly<Record<string, BucketRefAny>>;
  readonly cache?: Readonly<Record<string, CacheRefAny>>;
  readonly agents?: Readonly<Record<string, AgentRefAny>>;
}

/** Source category of a function invocation.
 * @example const source: InvocationSource = "tool";
 */
export type InvocationSource = SharedInvocationSource;
/** Trace and identity metadata for one invocation.
 * @example const metadata: InvocationMetadata = context.invocation;
 */
export type InvocationMetadata = SharedInvocationMetadata;
/** Application environment supplied to handlers.
 * @example const env: ResolvedApplicationEnv = context.env;
 */
export type ResolvedApplicationEnv = keyof Relkit.ApplicationEnv extends never
  ? Readonly<Record<string, unknown>>
  : Readonly<Relkit.ApplicationEnv>;

/** Logger exposed to application handlers.
 * @example const logger: PublicLogger = context.log;
 */
export type PublicLogger = SharedPublicLogger;
/** Clock exposed to application handlers.
 * @example const clock: PublicClock = context.time;
 */
export type PublicClock = SharedPublicClock;
/** Trace controls exposed to handlers.
 * @example const trace: PublicTrace = context.trace;
 */
export type PublicTrace = SharedPublicTrace;

declare global {
  namespace Relkit {
    interface ApplicationEnv {}
    interface ApplicationContextRegistry {}
    interface EventRegistry {}
    /** Database integrations add one entry mapping their service descriptor to its context. */
    interface DatabaseContexts<Service> {}
  }
}

/** Application-owned additions to the handler context.
 * @example type Registry = ApplicationContextRegistry;
 */
export type ApplicationContextRegistry = Relkit.ApplicationContextRegistry;

type RegisteredContext<
  Key extends PropertyKey,
  Fallback,
> = Key extends keyof Relkit.ApplicationContextRegistry
  ? Relkit.ApplicationContextRegistry[Key]
  : Fallback;

/** Session lookup available to a handler.
 * @example const session = await context.auth.getSession();
 */
export interface AuthContext<Session = unknown> {
  /** Looks up the current session.
   * @returns The session or null when unauthenticated.
   * @example const session = await context.auth.getSession();
   */
  readonly getSession: () => Promise<Session | null>;
}

/** Function dependency declarations accepted by `defineFunction`.
 * @example type Allowed = FunctionDependencyOptions<FunctionDependencies>;
 */
export type FunctionDependencyOptions<D extends FunctionDependencies> = D;

/** Invocation context before optional progress is added.
 * @example const env = context.env;
 */
export interface FunctionContextBase<
  D extends FunctionDependencies = {},
> {
  readonly invocation: InvocationMetadata;
  readonly signal: AbortSignal;
  readonly env: ResolvedApplicationEnv;
  readonly log: PublicLogger;
  readonly time: PublicClock;
  readonly trace: PublicTrace;
  readonly functions: FunctionClients<D["functions"]>;
  readonly tasks: TaskClients<D["tasks"]>;
  readonly jobs: JobClients<D["jobs"]>;
  readonly events: EventClients<D["events"]>;
  readonly channels: ChannelClients<D["channels"]>;
  readonly databases: DatabaseClients<D["databases"]>;
  readonly buckets: BucketClients<D["buckets"]>;
  readonly cache: CacheClients<D["cache"]>;
  readonly agents: AgentClients<D["agents"]>;
  readonly database: RegisteredContext<"database", Readonly<Record<string, never>>>;
  readonly auth: RegisteredContext<"auth", AuthContext>;
  readonly constants: RegisteredContext<"constants", Readonly<Record<string, never>>>;
  readonly prompts: RegisteredContext<"prompts", Readonly<Record<string, never>>>;
}

/** Handler context with declared resources and optional progress.
 * @example const run = async (_input: unknown, context: FunctionContext) => context.time.now();
 */
export type FunctionContext<
  D extends FunctionDependencies = {},
  Progress = never,
> = FunctionContextBase<D> &
  ([Progress] extends [never]
    ? {}
    : { readonly progress: import("../invocation/index.js").ProgressEmitter<Progress> });
