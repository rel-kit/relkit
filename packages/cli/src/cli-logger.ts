import { Effect, Exit, Fiber, MutableRef, Queue, Ref, Scope } from "effect";
import { canonicalJson } from "@relkit/contracts";
import { createLoggerLayer, type LogRecord } from "@relkit/runtime-effect";
import type { CliIo, CliLogger } from "./main-support-types.js";
import type { CliLogEvent } from "./cli-logger.types.js";

/**
 * Owns an ordered log fiber for the existing synchronous native callback facade.
 * @param json - Existing JSON logging policy.
 * @param io - Invocation-owned sinks.
 * @returns A scoped logger callback, drained before its owner closes.
 * @remarks Queue.offerUnsafe is confined to the native callback boundary. One
 * child scope owns the log fiber, and no callback starts a separate Effect runner.
 */
export function createCliLoggerEffect(json: boolean, io: CliIo) {
  return Effect.acquireRelease(
    Effect.gen(function* () {
      const queue = yield* Queue.unbounded<CliLogEvent>();
      const scope = yield* Scope.make();
      const open = yield* Ref.make(true);
      const logging = createLoggerLayer({
        component: "cli",
        human: json ? false : { write: (line: string) => io.stderr(line) },
        json: json ? { write: (record: LogRecord) => io.stderr(canonicalJson(record)) } : false,
      });
      const fiber = yield* drainLogs(queue).pipe(Effect.provide(logging), Effect.forkIn(scope));
      const log: CliLogger = (level, message, fields) => {
        if (MutableRef.get(open.ref))
          Queue.offerUnsafe(queue, { kind: "log", level, message, fields: fields ?? {} });
      };
      return { log, queue, scope, fiber, open };
    }),
    (owner) =>
      Effect.gen(function* () {
        yield* Ref.set(owner.open, false);
        yield* Queue.offer(owner.queue, { kind: "stop" });
        yield* Fiber.await(owner.fiber);
        yield* Scope.close(owner.scope, Exit.void);
      }),
  ).pipe(Effect.map((owner) => owner.log));
}

/**
 * Delivers queued records in order until the owning scope requests completion.
 * @param queue - Invocation-local native callback queue.
 * @returns Completion after all records preceding its stop marker are delivered.
 */
const drainLogs = Effect.fn("Cli.logs")(function* (queue: Queue.Queue<CliLogEvent>) {
  while (true) {
    const event = yield* Queue.take(queue);
    if (event.kind === "stop") return;
    const log = logAtLevel[event.level](event.message);
    yield* log.pipe(Effect.annotateLogs(event.fields));
  }
});

const logAtLevel = {
  trace: Effect.logTrace,
  debug: Effect.logDebug,
  info: Effect.logInfo,
  warn: Effect.logWarning,
  error: Effect.logError,
  fatal: Effect.logFatal,
} as const;
