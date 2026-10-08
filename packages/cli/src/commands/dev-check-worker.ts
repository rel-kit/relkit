import { Cause, Effect, Schema } from "effect";
import { checkProjectEffect } from "./check.js";
import { devCheckRequestSchema } from "./dev-check.schemas.js";
import { projectCapabilitiesLayer } from "../services/project-capabilities.js";
import { cliPromise, cliTry } from "../cli-errors.js";
import { runCliEffect } from "../cli-runtime.js";
import type { DevCheckResponse } from "./dev-check.types.js";

/** Flushes one private IPC response before releasing imported native handles. */
const worker = Effect.gen(function* () {
  const request = yield* Effect.callback<unknown>((resume) => {
    const listener = (message: unknown) => resume(Effect.succeed(message));
    process.once("message", listener);
    return Effect.sync(() => process.removeListener("message", listener));
  });
  const checked = yield* cliTry("dev.compiler.request", () => {
    if (!Schema.is(devCheckRequestSchema)(request))
      throw new TypeError("Development compiler request is invalid.");
    return request;
  }).pipe(
    Effect.flatMap((request) => checkProjectEffect({ ...request, mode: "development" })),
    Effect.map((result): DevCheckResponse => ({ result })),
    Effect.catchCause((cause) => Effect.succeed<DevCheckResponse>({ error: Cause.pretty(cause) })),
  );
  yield* cliPromise(
    "dev.compiler.reply",
    () =>
      new Promise<void>((resolve, reject) => {
        if (!process.send) return reject(new Error("Development compiler IPC is unavailable."));
        process.send(checked, (error: Error | null) => (error ? reject(error) : resolve()));
      }),
  );
});

// This process is a single edge runtime. IPC flush completes before process exit;
// the parent Scope then kills and reaps any evaluator descendants.
void runCliEffect(worker, projectCapabilitiesLayer).then(
  () => process.exit(0),
  () => process.exit(1),
);
