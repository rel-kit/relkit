import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Deferred, Effect, Fiber, Ref } from "effect";
import { activateDrizzleService } from "../../src/activation.js";
import { defineDrizzleService } from "../../src/service.js";
import { nativeCall } from "../../src/failure.js";
import { owners, withDrizzleWork } from "../../src/owner.js";
import { inheritNativeLeases, NativeLeases } from "../../src/native-leases.js";
import type { NativeLease } from "../../src/native-leases.types.js";
import { transactionEffect } from "../../src/transaction.js";
import { withDrizzleSqliteWork } from "../../src/coordination.js";
import { gate, records, sqliteClient } from "./fixtures.js";

it.effect("native SDK hooks borrow the exact active owner and SQLite permit during close", () =>
  Effect.gen(function* () {
    const client = sqliteClient();
    const entered = yield* Deferred.make<void>();
    const nested = yield* Deferred.make<void>();
    const hook = gate<void>();
    const completed = gate<void>();
    let queries = 0;
    let disposed = 0;
    let hookError: unknown;
    const active = yield* Effect.promise(() =>
      activateDrizzleService(
        defineDrizzleService({
          schema: { records },
          client: () => client,
          dispose: () => {
            disposed++;
          },
          overrides: {
            records: {
              findMany: () => {
                if (client.transactionActive())
                  throw new Error("SDK hook joined unrelated transaction");
                queries++;
                return [];
              },
            },
          },
        }),
        {},
        { isolated: true },
      ),
    );
    const sdk = yield* Effect.forkChild(
      withDrizzleWork(
        active,
        withDrizzleSqliteWork(
          active,
          nativeCall("auth.api", async () => {
            await Effect.runPromise(Deferred.succeed(entered, undefined));
            await hook.promise;
            try {
              await active.context.records.findMany();
            } catch (error) {
              hookError = error;
            }
            await Effect.runPromise(Deferred.succeed(nested, undefined));
            await completed.promise;
          }),
        ),
      ),
    );
    yield* Deferred.await(entered);
    const conflicting = active.context.transaction(() => 1).catch((error: unknown) => error);
    const closing = active.close();
    hook.resolve(undefined);
    yield* Deferred.await(nested);
    completed.resolve(undefined);
    expect(hookError).toBeUndefined();
    expect(queries).toBe(1);
    expect(client.statements).toEqual([]);
    expect(disposed).toBe(0);
    yield* Fiber.join(sdk);
    expect(yield* Effect.promise(() => conflicting)).toBeInstanceOf(TypeError);
    yield* Effect.promise(() => closing);
    expect(client.statements).toEqual([]);
    expect(disposed).toBe(1);
  }),
);

it.effect("detached native children retain admission and physical exclusion until settlement", () =>
  Effect.gen(function* () {
    const client = sqliteClient();
    const started = gate<void>();
    const parentReturned = gate<void>();
    const completed = gate<void>();
    let child: Promise<void> | undefined;
    let parentLease: NativeLease | undefined;
    let disposed = 0;
    let nativeRunning = false;
    const nativeRun = client.run.bind(client);
    client.run = (statement) => {
      if (nativeRunning) throw new Error("transaction overlapped detached native child");
      return nativeRun(statement);
    };
    const active = yield* Effect.promise(() =>
      activateDrizzleService(
        defineDrizzleService({
          schema: { records },
          client: () => client,
          overrides: { records: { findMany: () => [] } },
          dispose: () => {
            disposed++;
          },
        }),
        {},
        { isolated: true },
      ),
    );
    const parent = yield* Effect.forkChild(
      withDrizzleWork(
        active,
        withDrizzleSqliteWork(
          active,
          nativeCall("auth.api", async () => {
            parentLease = Effect.runSync(inheritNativeLeases(NativeLeases)).sqlite;
            child = Effect.runPromise(
              inheritNativeLeases(
                withDrizzleWork(
                  active,
                  withDrizzleSqliteWork(
                    active,
                    nativeCall("nested", async () => {
                      nativeRunning = true;
                      started.resolve(undefined);
                      await completed.promise;
                      await active.context.records.findMany();
                      nativeRunning = false;
                    }),
                  ),
                ),
              ),
            );
            await started.promise;
            parentReturned.resolve(undefined);
          }),
        ),
      ),
    );
    yield* Effect.promise(() => parentReturned.promise);
    if (parentLease === undefined) throw new Error("missing parent lease");
    while (!(yield* Ref.get(parentLease.state)).closing) yield* Effect.yieldNow;
    const conflicting = yield* Effect.forkChild(
      transactionEffect(client, "sqlite", () => Promise.resolve(1)),
    );
    const closing = active.close();
    yield* Effect.yieldNow;
    yield* Effect.promise(() => Promise.resolve());
    expect(client.statements).toEqual([]);
    expect(disposed).toBe(0);
    completed.resolve(undefined);
    if (child === undefined) throw new Error("missing child");
    const childPromise = child;
    yield* Effect.promise(() => childPromise);
    yield* Fiber.join(parent);
    expect(yield* Fiber.join(conflicting)).toBe(1);
    yield* Effect.promise(() => closing);
    expect(client.statements).toEqual(["begin", "commit"]);
    expect(disposed).toBe(1);
    expect(owners.get(active)?.service.drained.isOpen()).toBe(true);
  }),
);

it.effect("escaped native descendants reacquire after their parent lease expires", () =>
  Effect.gen(function* () {
    const client = sqliteClient();
    const escapedGate = gate<void>();
    const transactionGate = gate<void>();
    const transactionEntered = yield* Deferred.make<void>();
    let escaped: Promise<unknown> | undefined;
    let queries = 0;
    const active = yield* Effect.promise(() =>
      activateDrizzleService(
        defineDrizzleService({
          schema: { records },
          client: () => client,
          overrides: {
            records: {
              findMany: () => {
                if (client.transactionActive())
                  throw new Error("stale token bypassed SQLite permit");
                queries++;
                return [];
              },
            },
          },
        }),
        {},
        { isolated: true },
      ),
    );
    yield* withDrizzleWork(
      active,
      withDrizzleSqliteWork(
        active,
        nativeCall("auth.api", () => {
          escaped = escapedGate.promise.then(() => active.context.records.findMany());
        }),
      ),
    );
    const conflicting = active.context.transaction(async () => {
      await Effect.runPromise(Deferred.succeed(transactionEntered, undefined));
      await transactionGate.promise;
    });
    yield* Deferred.await(transactionEntered);
    escapedGate.resolve(undefined);
    yield* Effect.promise(() => Promise.resolve());
    expect(queries).toBe(0);
    transactionGate.resolve(undefined);
    yield* Effect.promise(() => conflicting);
    if (escaped === undefined) throw new Error("missing escaped callback");
    const escapedPromise = escaped;
    expect(yield* Effect.promise(() => escapedPromise)).toEqual([]);
    expect(queries).toBe(1);
    yield* Effect.promise(() => active.close());
  }),
);
