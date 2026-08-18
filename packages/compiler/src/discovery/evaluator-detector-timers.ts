import timers from "node:timers";

type MutableRecord = Record<string, unknown>;
type GenericFunction = (...args: unknown[]) => unknown;
type Restore = () => void;

export interface TimerRecord {
  readonly kind: "setTimeout" | "setInterval" | "setImmediate";
  readonly cancel: () => void;
}

export function installTimers(
  timersByHandle: Map<unknown, TimerRecord>,
  restores: Restore[],
): void {
  const targets = [globalThis as unknown as MutableRecord, timers as unknown as MutableRecord];
  for (const target of targets) {
    patchTimer(target, "setTimeout", "setTimeout", timersByHandle, restores);
    patchTimer(target, "setInterval", "setInterval", timersByHandle, restores);
    patchTimer(target, "setImmediate", "setImmediate", timersByHandle, restores);
    patchClear(target, "clearTimeout", timersByHandle, restores);
    patchClear(target, "clearInterval", timersByHandle, restores);
    patchClear(target, "clearImmediate", timersByHandle, restores);
  }
}

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
  replace(
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
        cancel: () => scheduleClear(target, kind, handle),
      });
      return handle;
    },
    restores,
  );
}

function patchClear(
  target: MutableRecord,
  name: string,
  timersByHandle: Map<unknown, TimerRecord>,
  restores: Restore[],
): void {
  const original = target[name];
  if (typeof original !== "function") return;
  const clear = original as GenericFunction;
  replace(
    target,
    name,
    function (this: unknown, handle: unknown) {
      timersByHandle.delete(handle);
      return clear.apply(this, [handle]);
    },
    restores,
  );
}

function scheduleClear(target: MutableRecord, kind: TimerRecord["kind"], handle: unknown): void {
  const name =
    kind === "setInterval"
      ? "clearInterval"
      : kind === "setImmediate"
        ? "clearImmediate"
        : "clearTimeout";
  const clear = target[name];
  if (typeof clear === "function") clear.call(target, handle);
}

export function installOutput(
  restores: Restore[],
  capture: (stream: "stdout" | "stderr", value: string) => void,
): void {
  const processRecord = process as unknown as MutableRecord;
  for (const [name, stream] of [
    ["stdout", "stdout"],
    ["stderr", "stderr"],
  ] as const) {
    const output = processRecord[name];
    if (output === null || typeof output !== "object") continue;
    const streamRecord = output as MutableRecord;
    if (typeof streamRecord.write === "function") {
      replace(
        streamRecord,
        "write",
        function (this: unknown, chunk: unknown, ...args: unknown[]) {
          capture(stream, textValue(chunk));
          const callback = args.at(-1);
          if (typeof callback === "function") callback(null);
          return true;
        },
        restores,
      );
    }
  }
  const consoleRecord = console as unknown as MutableRecord;
  for (const name of ["log", "info", "debug", "warn", "error", "trace", "dir", "table"]) {
    if (typeof consoleRecord[name] !== "function") continue;
    replace(
      consoleRecord,
      name,
      (...args: unknown[]) => {
        const stream = name === "warn" || name === "error" ? "stderr" : "stdout";
        capture(stream, `${args.map(textValue).join(" ")}\n`);
      },
      restores,
    );
  }
}

function replace(
  target: MutableRecord,
  name: string,
  replacement: GenericFunction,
  restores: Restore[],
): void {
  const original = target[name];
  target[name] = replacement;
  restores.push(() => {
    target[name] = original;
  });
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  try {
    return String(value);
  } catch {
    return "[unprintable]";
  }
}
