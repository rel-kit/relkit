/**
 * Transfers a database's native handles to the worker's explicit owning scope.
 * Acquisition failure closes partial handles; retirement flushes before release.
 */
import { Effect, Exit, Scope } from "effect";
import type { LocalWorkerCommand } from "@relkit/observability/local/record";
import { openDuckdbDatabaseEffect } from "./duckdb-database-effect.js";
import { DuckdbDriverService } from "./duckdb-driver.js";
import { duckdbError } from "./duckdb-error.js";
import type { DuckdbWorkerState } from "./duckdb-worker-state.types.js";

/** @param state - Worker-owned database authority. @returns Completion after flush and native scope release. */
export const closeDuckdbWorkerDatabase = Effect.fn("ObservabilityDuckdb.worker.closeDatabase")(
  function* (state: DuckdbWorkerState) {
    const current = state.database;
    const scope = state.databaseScope;
    state.database = undefined;
    state.databaseScope = undefined;
    if (current === undefined || scope === undefined) return;
    yield* current.flush().pipe(Effect.ensuring(Scope.close(scope, Exit.void)));
  },
);

/** @param state - Worker-owned database authority. @param command - Open request with the unchanged history root. @returns Existing-history import summary after scoped acquisition. */
export const openDuckdbWorkerDatabase = Effect.fn("ObservabilityDuckdb.worker.openDatabase")(
  function* (
    state: DuckdbWorkerState,
    command: Extract<LocalWorkerCommand, { readonly type: "open" }>,
  ) {
    if (state.database !== undefined)
      return yield* Effect.fail(
        duckdbError("open", new Error("Telemetry database is already open")),
      );
    return yield* Effect.uninterruptible(
      Effect.gen(function* () {
        const scope = yield* Scope.make();
        const acquired = yield* openDuckdbDatabaseEffect(
          command.root,
          command.retention,
          command.redaction,
        ).pipe(
          Scope.provide(scope),
          Effect.provideService(DuckdbDriverService, state.driver),
          Effect.onExit((exit) => (Exit.isSuccess(exit) ? Effect.void : Scope.close(scope, exit))),
        );
        state.database = acquired;
        state.databaseScope = scope;
        return acquired.imported;
      }),
    );
  },
);

/** @param state - Worker-owned authority. @param command - Serialized wire operation. @returns Database operation result or typed state failure. */
export const executeDuckdbWorkerCommand = Effect.fn("ObservabilityDuckdb.worker.command")(
  function* (state: DuckdbWorkerState, command: LocalWorkerCommand) {
    if (command.type === "open") return yield* openDuckdbWorkerDatabase(state, command);
    const database = state.database;
    if (database === undefined)
      return yield* Effect.fail(
        duckdbError("command", new Error("Telemetry database is not open")),
      );
    switch (command.type) {
      case "append":
        return yield* database.append(command.records);
      case "query":
        return yield* database.list(command.kind, command.query);
      case "detail":
        return yield* database.detail(command.kind, command.id);
      case "retention":
        return yield* database.configure(command.retention, command.redaction);
      case "flush":
        return yield* database.flush();
      case "close":
        return yield* closeDuckdbWorkerDatabase(state);
    }
  },
);
