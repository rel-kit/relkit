import { expect, test } from "bun:test";
import { installInvocationSignals } from "../../src/invocation-signals.js";
import { failSignal, installSignals, toFailure } from "../../src/main-support.js";

for (const [signal, exitCode] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
  ["SIGHUP", 129],
] as const) {
  test(`invocation owns ${signal} cancellation and releases its listener`, () => {
    const previous = process.listeners(signal);
    const controller = new AbortController();
    const remove = installInvocationSignals(controller);
    try {
      const acquired = process.listeners(signal).filter((handler) => !previous.includes(handler));
      expect(acquired).toHaveLength(1);
      acquired[0]?.();
      expect(controller.signal.aborted).toBe(true);
      expect(controller.signal.reason).toMatchObject({
        code: "RELKIT_INTERRUPTED",
        exitCode,
        signal,
        message: `Received ${signal}.`,
      });
      acquired[0]?.();
      expect(controller.signal.reason.exitCode).toBe(exitCode);
    } finally {
      remove();
      remove();
    }
    expect(process.listeners(signal)).toEqual(previous);
  });
}

test("the first shutdown signal wins and unrelated listeners survive release", () => {
  const borrowed = () => undefined;
  process.on("SIGHUP", borrowed);
  const controller = new AbortController();
  const previousHup = process.listeners("SIGHUP");
  const previousTerm = process.listeners("SIGTERM");
  const remove = installInvocationSignals(controller);
  try {
    const hup = process.listeners("SIGHUP").find((handler) => !previousHup.includes(handler));
    const term = process.listeners("SIGTERM").find((handler) => !previousTerm.includes(handler));
    expect(hup).toBeDefined();
    expect(term).toBeDefined();
    hup?.();
    const reason = controller.signal.reason;
    term?.();
    expect(controller.signal.reason).toBe(reason);
    expect(reason.exitCode).toBe(129);
    remove();
    expect(process.listeners("SIGHUP")).toEqual(previousHup);
    expect(process.listeners("SIGTERM")).toEqual(previousTerm);
  } finally {
    remove();
    process.off("SIGHUP", borrowed);
  }
});

test("ordinary invocation presentation retains the hangup reason and status", () => {
  const controller = new AbortController();
  const reason = Object.assign(new Error("Received SIGHUP."), {
    code: "RELKIT_INTERRUPTED",
    exitCode: 129,
    signal: "SIGHUP",
  });
  controller.abort(reason);
  expect(toFailure(new Error("interrupted work"), controller.signal)).toBe(reason);
});

test("the public CLI owner joins the same typed hangup contract", () => {
  const previous = process.listeners("SIGHUP");
  const controller = new AbortController();
  const remove = installSignals(controller);
  try {
    const handler = process.listeners("SIGHUP").find((listener) => !previous.includes(listener));
    expect(handler).toBeDefined();
    handler?.();
    expect(toFailure(undefined, controller.signal)).toMatchObject({
      code: "RELKIT_INTERRUPTED",
      message: "Received SIGHUP.",
      exitCode: 129,
      signal: "SIGHUP",
    });
    expect(failSignal("SIGHUP").exitCode).toBe(129);
  } finally {
    remove();
  }
  expect(process.listeners("SIGHUP")).toEqual(previous);
});

test("unsupported signal metadata does not acquire a trusted failure contract", () => {
  const controller = new AbortController();
  controller.abort(
    Object.assign(new Error("untrusted"), {
      code: "RELKIT_INTERRUPTED",
      exitCode: 137,
      signal: "SIGKILL",
    }),
  );
  expect(toFailure(undefined, controller.signal)).toMatchObject({
    code: "RELKIT_INTERRUPTED",
    message: "Operation interrupted.",
    exitCode: 130,
  });
});
