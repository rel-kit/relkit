/**
 * Owns duckdb worker for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import { Effect, Exit, Scope } from "effect";
import { startDuckdbWorkerProcessEffect } from "./duckdb-worker-process.js";
const scope = Effect.runSync(Scope.make());
void Effect.runPromise(startDuckdbWorkerProcessEffect(scope).pipe(Scope.provide(scope))).catch(
  (error) => {
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
