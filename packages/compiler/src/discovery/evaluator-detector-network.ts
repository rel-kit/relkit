import { observeCompiler } from "../observability.js";
import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { Effect } from "effect";
import { runDiscoverySync } from "./discovery-sync.js";
import { replaceNative } from "./evaluator-detector-native.js";
import { isAllowed, targetFor } from "./evaluator-detector-network-utils.js";
import type {
  GenericFunction,
  MutableRecord,
  Restore,
  Violate,
} from "./evaluator-detector-native.types.js";
import type { EvaluatorSideEffectKind } from "./evaluator-protocol.js";

/**
 * Installs outbound, listener and process guards for a scoped candidate.
 * @param allowlist - Explicit destinations or hostnames approved by the request.
 * @param restores - Session-owned rollback capabilities.
 * @param violate - Synchronous rejection boundary recording blocked native calls.
 * @returns A lazy effect installing all available native hooks; assignment failures are defects.
 */
export const installNetworkDetectorsEffect = Effect.fn("Discovery.installNetworkDetectors")(
  function* (allowlist: readonly string[], restores: Restore[], violate: Violate) {
    const bun = (typeof Bun === "undefined" ? {} : Bun) as unknown as MutableRecord;
    yield* Effect.forEach(
      ["listen", "serve"],
      (name) => Effect.sync(() => patchReject(bun, name, "listening-socket", restores, violate)),
      { discard: true },
    );
    yield* Effect.forEach(
      ["spawn", "spawnSync", "$"],
      (name) => Effect.sync(() => patchReject(bun, name, "child-process", restores, violate)),
      { discard: true },
    );
    yield* Effect.sync(() => patchChecked(bun, "connect", allowlist, restores, violate));
    const globals = globalThis as unknown as MutableRecord;
    yield* Effect.forEach(
      ["fetch", "WebSocket", "EventSource", "XMLHttpRequest"],
      (name) => Effect.sync(() => patchChecked(globals, name, allowlist, restores, violate)),
      { discard: true },
    );
    yield* Effect.forEach(
      ["spawn", "spawnSync", "exec", "execFile", "fork"],
      (name) =>
        Effect.sync(() =>
          patchReject(
            childProcess as unknown as MutableRecord,
            name,
            "child-process",
            restores,
            violate,
          ),
        ),
      { discard: true },
    );
    yield* Effect.forEach(
      [http, https],
      (target) =>
        Effect.forEach(
          ["request", "get"],
          (name) =>
            Effect.sync(() =>
              patchChecked(target as unknown as MutableRecord, name, allowlist, restores, violate),
            ),
          { discard: true },
        ),
      { discard: true },
    );
    yield* Effect.forEach(
      [
        [tls, "connect"],
        [net, "connect"],
        [net, "createConnection"],
        [dgram.Socket.prototype, "connect"],
        [dns, "lookup"],
        [dns, "resolve"],
        [dns, "reverse"],
      ] as const,
      ([target, name]) =>
        Effect.sync(() =>
          patchChecked(target as unknown as MutableRecord, name, allowlist, restores, violate),
        ),
      { discard: true },
    );
    yield* Effect.sync(() =>
      patchReject(
        net.Server.prototype as unknown as MutableRecord,
        "listen",
        "listening-socket",
        restores,
        violate,
      ),
    );
    yield* Effect.sync(() =>
      patchReject(
        dgram.Socket.prototype as unknown as MutableRecord,
        "bind",
        "listening-socket",
        restores,
        violate,
      ),
    );
  },
  (effect, allowlist, restores, violate) =>
    observeCompiler("discovery", "installNetworkDetectors", effect, () => ({}), false),
);

/**
 * Synchronous compatibility boundary for manually owned network hooks.
 * @param allowlist - Approved destinations or hostnames.
 * @param restores - Rollback capabilities retained by the caller.
 * @param violate - Native blocked-operation callback.
 * @returns Nothing after installation; caller must roll back partial failures.
 */
export function installNetworkDetectors(
  allowlist: readonly string[],
  restores: Restore[],
  violate: Violate,
): void {
  runDiscoverySync(installNetworkDetectorsEffect(allowlist, restores, violate));
}

/**
 * Replaces a native listener or process API with a synchronous rejection adapter.
 * @param target - Native API object.
 * @param name - Method to intercept.
 * @param kind - Report category for this forbidden capability.
 * @param restores - Session's rollback capabilities.
 * @param violate - Recording rejection boundary.
 * @returns Nothing after registering the native replacement.
 */
function patchReject(
  target: MutableRecord,
  name: string,
  kind: EvaluatorSideEffectKind,
  restores: Restore[],
  violate: Violate,
): void {
  if (typeof target[name] !== "function") return;
  replaceNative(
    target,
    name,
    (...args: unknown[]) => violate(kind, name, targetFor(kind, args)),
    restores,
  );
}

/**
 * Adapts an outbound native API, preserving its receiver and approved invocations.
 * @param target - Native API object.
 * @param name - Method to intercept.
 * @param allowlist - Explicit destination permissions.
 * @param restores - Session's rollback capabilities.
 * @param violate - Recording rejection boundary.
 * @returns Nothing; synchronous native validation runs only within the owning session.
 */
function patchChecked(
  target: MutableRecord,
  name: string,
  allowlist: readonly string[],
  restores: Restore[],
  violate: Violate,
): void {
  const original = target[name];
  if (typeof original !== "function") return;
  const method = original as GenericFunction;
  replaceNative(
    target,
    name,
    function (this: unknown, ...args: unknown[]) {
      const destination = targetFor("unapproved-network", args);
      if (!isAllowed(destination, allowlist)) violate("unapproved-network", name, destination);
      return method.apply(this, args);
    },
    restores,
  );
}
