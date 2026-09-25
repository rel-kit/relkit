import { Effect, Exit, Scope } from "effect";
import { startDuckdbWorkerProcessEffect } from "./duckdb-worker-process.js";
const scope = Effect.runSync(Scope.make());
void Effect.runPromise(startDuckdbWorkerProcessEffect().pipe(Scope.provide(scope))).catch(
  (error: unknown) => {
    process.send?.({
      id: 0,
      fatal: true,
      error: `Telemetry worker startup failed: ${String(error)}`,
    });
    process.exitCode = 1;
    void Effect.runPromise(Scope.close(scope, Exit.fail(error))).then(
      () => process.disconnect?.(),
      () => process.disconnect?.(),
    );
  },
);
