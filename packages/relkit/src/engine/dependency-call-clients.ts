import type { MaybePromise } from "../contracts/index.js";
import { dispatchInvocation, type InvocationTarget } from "../invocation/index.js";
import {
  getChannelPresenceEffect,
  runChannelPromise,
  triggerChannelEffect,
} from "../realtime/channel-operations.js";
import type { ChannelDescriptorData } from "../realtime/index.js";
import type { DependencyClientBuildOptions } from "./dependencies.types.js";
import { DependencyNotConfiguredError } from "./dependency-errors.js";
import { notify } from "./edge-hooks.js";
import { runDependency } from "./dependency-run.js";

/** Build the callable client for a function declared under `dependencies.functions`.
 * A configured callable source replaces the call; otherwise the call enters the active engine as a
 * direct child, or the invocation scope's dispatcher when no engine child invoker exists.
 * @returns A callable returning the validated function output.
 * @param name - Declared dependency name.
 * @param source - Optional configured client replacing the call.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param functionId - Canonical identity of the declared function.
 */
export function createFunctionDependencyClient(
  name: string,
  source: unknown,
  options: DependencyClientBuildOptions,
  functionId: string,
): (input: unknown) => Promise<unknown> {
  if (source !== undefined && typeof source !== "function" && !isRecord(source))
    throw new TypeError(`Invalid functions client "${name}"`);
  return (input) => {
    if (typeof source === "function")
      return runDependency(options, "functions", name, "call", () =>
        (source as (value: unknown) => MaybePromise<unknown>)(input),
      );
    const declaration = options.dependencies?.functions?.[name];
    if (declaration === undefined) throw new DependencyNotConfiguredError("functions", name);
    notify(options.onObservedEdge, {
      relationship: "calls-function",
      from: options.ownerId,
      to: functionId,
    });
    if (options.invokeFunction !== undefined)
      return Promise.resolve(
        options.invokeFunction({
          functionId,
          name,
          declaration,
          source: declaration,
          input,
          ...(options.signal === undefined ? {} : { signal: options.signal() }),
        }),
      );
    return dispatchInvocation({
      target: declaration as unknown as InvocationTarget,
      input,
      ...(options.signal === undefined ? {} : { options: { signal: options.signal() } }),
    });
  };
}

/** Build the client for a channel declared under `dependencies.channels`.
 * @returns Trigger and presence methods bound to the declared channel.
 * @param name - Declared dependency name.
 * @param source - Optional configured client replacing the realtime provider.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function createChannelDependencyClient(
  name: string,
  source: unknown,
  options: DependencyClientBuildOptions,
): Readonly<Record<string, (...args: readonly unknown[]) => Promise<unknown>>> {
  const configured = isRecord(source) ? source : undefined;
  if (source !== undefined && configured === undefined)
    throw new TypeError(`Invalid channels client "${name}"`);
  const channel = (): ChannelDescriptorData => {
    const declaration = options.dependencies?.channels?.[name];
    if (declaration === undefined) throw new DependencyNotConfiguredError("channels", name);
    return declaration as unknown as ChannelDescriptorData;
  };
  const call = (method: "trigger" | "getPresence", args: readonly unknown[]) =>
    runDependency(options, "channels", name, method, () => {
      const replacement = configured?.[method];
      if (typeof replacement === "function") return replacement(...args) as unknown;
      return method === "trigger"
        ? runChannelPromise(
            triggerChannelEffect(
              channel(),
              args[0],
              String(args[1]),
              args[2],
              args[3] as Parameters<typeof triggerChannelEffect>[4],
            ),
          )
        : runChannelPromise(getChannelPresenceEffect(channel(), args[0]));
    });
  return Object.freeze({
    trigger: (...args: readonly unknown[]) => call("trigger", args),
    getPresence: (...args: readonly unknown[]) => call("getPresence", args),
  });
}

/** Return the active context of a database declared under `dependencies.databases`.
 * @returns The database context, or a client that reports the missing database on use.
 * @param name - Declared dependency name.
 * @param source - Active database context from the running application.
 */
export function createDatabaseDependencyClient(name: string, source: unknown): unknown {
  if (isRecord(source)) return source;
  return new Proxy(Object.freeze({}), {
    get(_target, property) {
      if (typeof property !== "string" || property === "then") return undefined;
      throw new DependencyNotConfiguredError("databases", name);
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
