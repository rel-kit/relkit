import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Deferred, Effect, MutableRef, Option, Ref, Schema } from "effect";
import { cliTry, cliPromise } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { cleanupEffect, cleanupLayer } from "../services/cleanup.service.js";
import { devCheckResponseSchema } from "./dev-check.schemas.js";
import type { CheckResult } from "./check-result.js";
import type { DevCheckRequest } from "./dev-check.types.js";

/**
 * Checks one generation in a scoped compiler/evaluator process group.
 * @param request - Project root and fresh generation identity.
 * @returns A validated check result after the compiler and descendants are joined.
 * @remarks Windows owns the direct compiler; POSIX also owns its evaluator descendants.
 */
export const checkDevProjectEffect = Effect.fn("Dev.check")(
  function* (request: DevCheckRequest) {
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const diagnostic = yield* Ref.make("");
        const response = yield* Ref.make<unknown>(undefined);
        const failure = yield* Ref.make<Error | undefined>(undefined);
        const exited = yield* Deferred.make<number | null>();
        const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
        const entrypoint = fileURLToPath(
          new URL(`./dev-check-worker.${extension}`, import.meta.url),
        );
        const grouped = process.platform !== "win32";
        const child = yield* Effect.acquireRelease(
          cliTry("dev.compiler.spawn", () => {
            const child = fork(entrypoint, [], {
              execPath: process.execPath,
              execArgv: ["--no-env-file", "--no-install"],
              cwd: request.projectRoot,
              detached: grouped,
              stdio: ["ignore", "ignore", "pipe", "ipc"],
            });
            child.stderr?.on("data", (chunk: Buffer) =>
              MutableRef.update(diagnostic.ref, (text) =>
                `${text}${chunk.toString()}`.slice(-8_192),
              ),
            );
            child.on("message", (message: unknown) => MutableRef.set(response.ref, message));
            child.once("error", (error) => {
              MutableRef.set(failure.ref, error);
              if (child.pid === undefined) Deferred.doneUnsafe(exited, Effect.succeed(null));
            });
            child.once("exit", (code) => Deferred.doneUnsafe(exited, Effect.succeed(code)));
            return child;
          }),
          (child) =>
            cleanupEffect(
              "dev.compiler.release",
              cliTry("dev.compiler.kill", () => {
                if (child.pid === undefined) return;
                if (!grouped) {
                  if (child.exitCode === null) child.kill("SIGKILL");
                  return;
                }
                try {
                  process.kill(-child.pid, "SIGKILL");
                } catch (error) {
                  if (!(error instanceof Error && "code" in error && error.code === "ESRCH"))
                    throw error;
                }
              }).pipe(
                Effect.andThen(
                  Deferred.await(exited).pipe(
                    Effect.interruptible,
                    Effect.timeoutOption(5_000),
                    Effect.flatMap((result) =>
                      Option.isSome(result)
                        ? Effect.void
                        : cliTry("dev.compiler.reap", () => {
                            throw new Error(
                              "Development compiler did not exit within the cleanup deadline.",
                            );
                          }),
                    ),
                  ),
                ),
                Effect.ensuring(
                  Effect.sync(() => {
                    child.removeAllListeners();
                    child.stderr?.removeAllListeners();
                  }),
                ),
              ),
            ),
        );
        yield* cliPromise(
          "dev.compiler.send",
          () =>
            new Promise<void>((resolve, reject) => {
              child.send(request, (error) => (error ? reject(error) : resolve()));
            }),
        );
        const code = yield* Deferred.await(exited);
        const error = yield* Ref.get(failure);
        if (error !== undefined)
          return yield* cliTry("dev.compiler.failure", () => {
            throw error;
          });
        const result = yield* Ref.get(response);
        return yield* cliTry("dev.compiler.result", (): CheckResult => {
          if (code !== 0 || result === undefined)
            throw new Error(`Development compiler exited (${code}): ${Ref.getUnsafe(diagnostic)}`);
          if (!Schema.is(devCheckResponseSchema)(result))
            throw new TypeError("Development compiler returned an invalid response.");
          if ("error" in result) throw new Error(result.error);
          return result.result;
        });
      }),
    );
  },
  (effect, _request: DevCheckRequest) => observeCli("dev.compiler.check", effect),
);

/**
 * Preserves the public Promise transport and original abort reason.
 * @param request - Authored project and generation identity.
 * @param signal - Supersession/shutdown signal.
 * @returns Ordinary check evidence after scoped process-group release.
 * @throws The original native failure or cancellation reason.
 */
export async function checkDevProject(
  request: DevCheckRequest,
  signal?: AbortSignal,
): Promise<CheckResult> {
  try {
    return await runCliEffect(checkDevProjectEffect(request), cleanupLayer, signal);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw error;
  }
}
