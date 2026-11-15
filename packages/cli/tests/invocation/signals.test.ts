import { expect, test } from "bun:test";
import { installInvocationSignals } from "../../src/invocation-signals.js";
import { failSignal, installSignals, toFailure } from "../../src/main-support.js";
import { runCli } from "../../src/main.js";

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

/** Runs `relkit create` and stops it with the given failure, as the signal handlers do. */
async function stopped(
  reason: ReturnType<typeof failSignal>,
  argv: readonly string[] = ["create", "demo"],
  closingLine?: string,
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const controller = new AbortController();
  const exitCode = await runCli(argv, {
    io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
    signal: controller.signal,
    installSignalHandlers: false,
    loadCreateRelkit: async () => ({
      normalizeCreateOptions: () => ({ name: "demo" }),
      generateProject: async (_options, context) => {
        if (closingLine !== undefined) context.io?.stderr(closingLine);
        controller.abort(reason);
        throw context.signal.reason;
      },
    }),
  });
  return { exitCode, stdout, stderr };
}

for (const [signal, exitCode] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
] as const) {
  test(`${signal} prints one neutral line and no error block in human output`, async () => {
    expect(await stopped(failSignal(signal))).toEqual({
      exitCode,
      stdout: [],
      stderr: ["Stopped."],
    });
  });

  test(`${signal} keeps the structured failure in JSON output`, async () => {
    const result = await stopped(failSignal(signal), ["--json", "create", "demo"]);
    expect(result.exitCode).toBe(exitCode);
    expect(result.stderr).toEqual([]);
    expect(JSON.parse(result.stdout[0]!)).toEqual({
      ok: false,
      error: { code: "RELKIT_INTERRUPTED", message: `Received ${signal}.` },
    });
  });
}

test("a command that printed its own closing line gets no second line", async () => {
  const closing = "12:00:00.000 INFO  relkit            Development server stopped";
  const result = await stopped(failSignal("SIGINT"), ["create", "demo"], closing);
  expect(result).toEqual({ exitCode: 130, stdout: [], stderr: [closing] });
});

test("SIGHUP keeps the interruption message", async () => {
  const result = await stopped(failSignal("SIGHUP"));
  expect(result.exitCode).toBe(129);
  expect(result.stderr[0]).toBe("RELKIT_INTERRUPTED: Received SIGHUP.");
  expect(result.stderr).toHaveLength(3);
});

test("an interruption that carries no signal keeps the interruption message", async () => {
  const result = await stopped(
    Object.assign(failSignal("SIGINT"), { signal: undefined }) as ReturnType<typeof failSignal>,
  );
  expect(result.stderr[0]).toStartWith("RELKIT_INTERRUPTED:");
});
