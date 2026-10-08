import { Cause, Effect, Exit, MutableRef, Queue, Ref, Scope } from "effect";
import { cliAdapterError, cliOriginalError } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { EffectDevLocalCompiler, DevCompileMessage } from "./dev-local.types.js";

/**
 * Creates one session-owned callback queue for the supervisor's public Promise SDK.
 * @param compile - Captured native compiler operation.
 * @param scope - Session worker lifetime.
 * @returns Callback admission and synchronous admission close; no callback executes an Effect.
 */
export const makeDevCompilerBridgeEffect = Effect.fn("Dev.compilerBridge")(
  function* (compile: EffectDevLocalCompiler["compileEffect"], scope: Scope.Scope) {
    const queue = yield* Queue.make<DevCompileMessage>();
    const open = yield* Ref.make(true);
    yield* Effect.forkIn(
      Effect.forever(
        Effect.gen(function* () {
          const message = yield* Queue.take(queue);
          yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const work = compile(message.request);
              const outcome = yield* Effect.exit(
                restore(
                  message.request.signal
                    ? Effect.raceFirst(work, aborted(message.request.signal))
                    : work,
                ),
              );
              yield* Effect.sync(() =>
                Exit.isSuccess(outcome)
                  ? message.resolve(outcome.value)
                  : message.reject(
                      message.request.signal?.aborted
                        ? message.request.signal.reason
                        : cliOriginalError(Cause.squash(outcome.cause)),
                    ),
              );
            }),
          );
        }),
      ).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            MutableRef.set(open.ref, false);
            while (Queue.sizeUnsafe(queue)) {
              const pending = Queue.takeUnsafe(queue);
              if (pending && Exit.isSuccess(pending))
                pending.value.reject(new Error("Development compiler is closed."));
            }
            Queue.shutdownUnsafe(queue);
          }),
        ),
      ),
      scope,
    );
    return {
      compile: ((request) =>
        new Promise((resolve, reject) => {
          if (request.signal?.aborted) return reject(request.signal.reason);
          if (!Ref.getUnsafe(open) || !Queue.offerUnsafe(queue, { request, resolve, reject }))
            reject(new Error("Development compiler is closed."));
        })) satisfies EffectDevLocalCompiler["compile"],
      close: () => {
        MutableRef.set(open.ref, false);
      },
    };
  },
  (effect, _compile: EffectDevLocalCompiler["compileEffect"], _scope: Scope.Scope) =>
    observeCli("dev.compiler.bridge", effect),
);

/** Waits for foreign supervisor cancellation at the owned compiler bridge.
 * @param signal - Foreign supervisor cancellation.
 * @returns An interrupting typed boundary failure; racing joins the losing compiler.
 */
function aborted(signal: AbortSignal) {
  return Effect.callback<never, import("../cli-errors.js").CliAdapterError>((resume) => {
    const cancel = () => resume(Effect.fail(cliAdapterError("dev.compiler.abort", signal.reason)));
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
    return Effect.sync(() => signal.removeEventListener("abort", cancel));
  });
}
