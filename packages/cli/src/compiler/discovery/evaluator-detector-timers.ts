import { Effect } from "effect";
import timers from "node:timers";
import { observeCompiler } from "../observability.js";
import { runDiscoverySync } from "./discovery-sync.js";
import { replaceNative } from "./evaluator-detector-native.js";
import type { GenericFunction, MutableRecord, Restore } from "./evaluator-detector-native.types.js";
import type { OutputCapture, TimerRecord } from "./evaluator-detector-timers.types.js";
export type { TimerRecord } from "./evaluator-detector-timers.types.js";

/**
 * Installs native timer adapters under the caller's session ownership.
 * @param timersByHandle - Session-local ownership of scheduled native handles.
 * @param restores - Owner's reverse-order rollback capabilities.
 * @returns A lazy effect installing hooks; native assignment failures remain defects.
 */
export const installTimersEffect = Effect.fn("Discovery.installTimerDetectors")(
  function* (timersByHandle: Map<unknown, TimerRecord>, restores: Restore[]) {
    const targets = [globalThis as unknown as MutableRecord, timers as unknown as MutableRecord];
    yield* Effect.forEach(
      targets,
      (target) =>
        Effect.gen(function* () {
          yield* Effect.forEach(
            ["setTimeout", "setInterval", "setImmediate"] as const,
            (name) =>
              Effect.gen(function* () {
                yield* Effect.sync(() => patchTimer(target, name, name, timersByHandle, restores));
              }),
            { discard: true },
          );
          yield* Effect.forEach(
            ["clearTimeout", "clearInterval", "clearImmediate"],
            (name) =>
              Effect.gen(function* () {
                yield* Effect.sync(() => patchClear(target, name, timersByHandle, restores));
              }),
            { discard: true },
          );
        }),
      { discard: true },
    );
  },
  (effect) => observeCompiler("discovery", "installTimers", effect, () => ({}), false),
);

/**
 * Synchronous compatibility boundary for manually owned timer hooks.
 * @param timersByHandle - Handle ownership map.
 * @param restores - Rollback capabilities retained by the caller.
 * @returns Nothing after installation; caller is responsible for rollback on failure.
 */
export function installTimers(
  timersByHandle: Map<unknown, TimerRecord>,
  restores: Restore[],
): void {
  runDiscoverySync(installTimersEffect(timersByHandle, restores));
}

/**
 * Adapts one scheduling API while preserving receiver and callback arguments.
 * @param target - Native timer API owner.
 * @param name - Scheduling property to replace.
 * @param kind - Native scheduling category.
 * @param timersByHandle - Session-local handle ownership.
 * @param restores - Registered rollback capabilities.
 * @returns Nothing; callbacks stay synchronous under the enclosing Effect scope.
 */
function patchTimer(
  target: MutableRecord,
  name: string,
  kind: TimerRecord["kind"],
  timersByHandle: Map<unknown, TimerRecord>,
  restores: Restore[],
): void {
  const original = target[name];
  if (typeof original !== "function") return;
  const schedule = original as GenericFunction;
  const clearName =
    kind === "setInterval"
      ? "clearInterval"
      : kind === "setImmediate"
        ? "clearImmediate"
        : "clearTimeout";
  const clear = target[clearName];
  replaceNative(
    target,
    name,
    function (this: unknown, ...args: unknown[]) {
      let handle: unknown;
      const callback = args[0];
      const wrapped =
        typeof callback === "function"
          ? (...callbackArgs: unknown[]) => {
              if (kind !== "setInterval") timersByHandle.delete(handle);
              return callback(...callbackArgs);
            }
          : callback;
      handle = schedule.apply(this, [wrapped, ...args.slice(1)]);
      timersByHandle.set(handle, {
        kind,
        cancel: () => scheduleClear(target, clear, handle),
      });
      return handle;
    },
    restores,
  );
}

/**
 * Adapts native cancellation and releases ownership of its handle.
 * @param target - Native cancellation API owner.
 * @param name - Cancellation property to replace.
 * @param timersByHandle - Session-local handle ownership.
 * @param restores - Registered rollback capabilities.
 * @returns Nothing after replacing the native callback boundary.
 */
function patchClear(
  target: MutableRecord,
  name: string,
  timersByHandle: Map<unknown, TimerRecord>,
  restores: Restore[],
): void {
  const original = target[name];
  if (typeof original !== "function") return;
  const clear = original as GenericFunction;
  replaceNative(
    target,
    name,
    function (this: unknown, handle: unknown) {
      timersByHandle.delete(handle);
      return clear.apply(this, [handle]);
    },
    restores,
  );
}

/**
 * Cancels an owned handle through its platform's matching clear API.
 * @param target - Platform timer API object.
 * @param clear - Original cancellation capability retained before candidate code can replace it.
 * @param handle - Opaque platform timer handle.
 * @returns Nothing; native failures propagate to the supervising finalizer.
 */
function scheduleClear(target: MutableRecord, clear: unknown, handle: unknown): void {
  if (typeof clear === "function") clear.call(target, handle);
}

/**
 * Captures candidate output through native stream and console callback adapters.
 * @param restores - Session's registered rollback capabilities.
 * @param capture - Synchronous callback updating the session-owned observations.
 * @returns A lazy effect installing output hooks; assignment failures remain defects.
 */
export const installOutputEffect = Effect.fn("Discovery.installOutputDetectors")(
  function* (restores: Restore[], capture: OutputCapture) {
    const processRecord = process as unknown as MutableRecord;
    yield* Effect.forEach(
      [
        ["stdout", "stdout"],
        ["stderr", "stderr"],
      ] as const,
      ([name, stream]) =>
        Effect.gen(function* () {
          const output = processRecord[name];
          if (output === null || typeof output !== "object") return;
          const streamRecord = output as MutableRecord;
          if (typeof streamRecord.write === "function") {
            yield* Effect.sync(() =>
              replaceNative(
                streamRecord,
                "write",
                function (this: unknown, chunk: unknown, ...args: unknown[]) {
                  capture(stream, textValue(chunk));
                  const callback = args.at(-1);
                  if (typeof callback === "function") callback(null);
                  return true;
                },
                restores,
              ),
            );
          }
        }),
      { discard: true },
    );
    const consoleRecord = console as unknown as MutableRecord;
    yield* Effect.forEach(
      ["log", "info", "debug", "warn", "error", "trace", "dir", "table"],
      (name) =>
        Effect.gen(function* () {
          if (typeof consoleRecord[name] !== "function") return;
          yield* Effect.sync(() =>
            replaceNative(
              consoleRecord,
              name,
              (...args: unknown[]) => {
                const stream = name === "warn" || name === "error" ? "stderr" : "stdout";
                capture(stream, `${args.map(textValue).join(" ")}\n`);
              },
              restores,
            ),
          );
        }),
      { discard: true },
    );
  },
  (effect) => observeCompiler("discovery", "installOutput", effect, () => ({}), false),
);

/**
 * Synchronous compatibility boundary for manually owned output hooks.
 * @param restores - Rollback capabilities retained by the caller.
 * @param capture - Candidate output callback.
 * @returns Nothing after installation; caller is responsible for rollback on failure.
 */
export function installOutput(restores: Restore[], capture: OutputCapture): void {
  runDiscoverySync(installOutputEffect(restores, capture));
}

/**
 * Converts a native output chunk without suppressing user-defined conversion defects.
 * @param value - Stream chunk or console argument.
 * @returns Decoded binary text or the argument's platform string representation.
 */
function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  return String(value);
}
