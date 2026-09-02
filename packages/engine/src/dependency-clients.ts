import type { MaybePromise } from "@relkit/contracts";
import { createBucketClient } from "@relkit/buckets";
import type { GraphEdge, ObservedEdge } from "@relkit/graph";
import { getDescriptorIdentity } from "@relkit/invocation";
import { createEventDependencyClient } from "./event-client.js";
import type {
  DependencyBridgeOptions,
  DependencyCategory,
  DependencyClientBuildOptions,
  DependencyRefLike,
} from "./dependencies.js";
import { createCacheDependencyClient } from "./cache-client.js";
import { createJobDependencyClient } from "./job-client.js";
import { notify } from "./edge-hooks.js";

export class DependencyAccessError extends TypeError {
  readonly category: DependencyCategory;
  readonly dependencyName: string;
  constructor(category: DependencyCategory, name: string) {
    super(`Dependency "${category}.${name}" is not declared on this function`);
    this.name = "DependencyAccessError";
    this.category = category;
    this.dependencyName = name;
  }
}

export class DependencyNotConfiguredError extends Error {
  constructor(category: DependencyCategory, name: string) {
    super(`Dependency "${category}.${name}" has no active client`);
    this.name = "DependencyNotConfiguredError";
  }
}

const edgeKinds: Readonly<Record<DependencyCategory, GraphEdge["kind"]>> = {
  jobs: "enqueues-job",
  events: "publishes-event",
  buckets: "uses-bucket",
  cache: "uses-cache",
  agents: "invokes-agent",
};

const refKinds: Readonly<Record<DependencyCategory, string>> = {
  jobs: "job",
  events: "event",
  buckets: "bucket",
  cache: "cache",
  agents: "agent",
};

export function edgeKind(category: DependencyCategory): GraphEdge["kind"] {
  return edgeKinds[category] as GraphEdge["kind"];
}

export function dependencyId(
  category: DependencyCategory,
  name: string,
  value: DependencyRefLike,
): string {
  const reference = value.ref ?? value;
  const id = value.ref === undefined ? getDescriptorIdentity(value) : reference.id;
  if (reference.kind !== refKinds[category] || typeof id !== "string" || id.length === 0) {
    throw new TypeError(`Invalid ${category} dependency "${name}"`);
  }
  return id;
}

export function createClient(
  category: DependencyCategory,
  name: string,
  source: unknown,
  options: DependencyClientBuildOptions,
): unknown {
  switch (category) {
    case "agents":
      return wrapCallable(category, name, source, options);
    case "jobs":
      return createJobDependencyClient(
        name,
        source,
        options,
        dependencyIdFromClient(options, category, name),
      );
    case "events":
      return createEventDependencyClient(
        name,
        source,
        options,
        dependencyIdFromClient(options, category, name),
      );
    case "buckets":
      return createBucketClient({
        ownerId: options.ownerId,
        bucketId: dependencyIdFromClient(options, category, name),
        source,
        ...(options.bridge === undefined ? {} : { bridge: options.bridge }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
        ...(options.onObservedEdge === undefined ? {} : { onObservedEdge: options.onObservedEdge }),
        ...(options.onOperation === undefined ? {} : { onOperation: options.onOperation }),
      });
    case "cache":
      return createCacheDependencyClient(
        name,
        dependencyIdFromClient(options, category, name),
        source,
        options,
      );
  }
}

function wrapCallable(
  category: "agents",
  name: string,
  source: unknown,
  options: DependencyClientBuildOptions,
): (input: unknown) => Promise<unknown> {
  if (
    source !== undefined &&
    typeof source !== "function" &&
    options.invokeFunction === undefined
  ) {
    throw new TypeError(`Invalid ${category} client "${name}"`);
  }
  return (input) => {
    if (options.invokeFunction !== undefined) {
      notify(options.onObservedEdge, {
        relationship: edgeKinds[category],
        from: options.ownerId,
        to: dependencyIdFromClient(options, category, name),
      });
      const declaration = options.dependencies?.[category]?.[name];
      if (declaration === undefined) throw new DependencyNotConfiguredError(category, name);
      const dependency = dependencyId(category, name, declaration);
      return Promise.resolve(
        options.invokeFunction({
          functionId: category === "agents" ? `relkit.agent.${dependency}.invoke` : dependency,
          name,
          declaration,
          source,
          input,
          ...(options.signal === undefined ? {} : { signal: options.signal() }),
        }),
      );
    }
    return runDependency(options, category, name, "call", () => {
      if (source === undefined) throw new DependencyNotConfiguredError(category, name);
      return (source as (value: unknown) => MaybePromise<unknown>)(input);
    });
  };
}

export function runDependency<A>(
  options: DependencyClientBuildOptions,
  category: DependencyCategory,
  name: string,
  operation: string,
  work: () => MaybePromise<A>,
): Promise<A> {
  notify(options.onObservedEdge, {
    relationship: edgeKinds[category] as ObservedEdge["relationship"],
    from: options.ownerId,
    to: dependencyIdFromClient(options, category, name),
  });
  const bridgeOptions: DependencyBridgeOptions = {
    name: `relkit.dependency.${category}.${name}.${operation}`,
    attributes: { "relkit.dependency.category": category, "relkit.dependency.name": name },
  };
  return options.bridge === undefined
    ? Promise.resolve().then(work)
    : options.bridge.run(work, bridgeOptions);
}

function dependencyIdFromClient(
  options: DependencyClientBuildOptions,
  category: DependencyCategory,
  name: string,
): string {
  const declaration =
    category === "events" ? options.publications?.[name] : options.dependencies?.[category]?.[name];
  return declaration === undefined ? name : dependencyId(category, name, declaration);
}
export function guardedMap(
  category: DependencyCategory,
  clients: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const target = Object.freeze(clients);
  return new Proxy(target, {
    get(current, property, receiver) {
      if (typeof property === "string" && !Object.hasOwn(current, property))
        throw new DependencyAccessError(category, property);
      return Reflect.get(current, property, receiver);
    },
  });
}
