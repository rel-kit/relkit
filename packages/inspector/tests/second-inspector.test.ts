/**
 * A second Inspector for a project whose history another Inspector holds says so once, plainly,
 * with where the other one listens when it recorded that, and prints no repeated error blocks.
 * It keeps running without history (DuckDB lets one process hold the file, even to read it) and
 * takes the history over when the other Inspector stops.
 */
import { expect, it } from "@effect/vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Deferred, Effect, Fiber, Layer, Logger, Ref } from "effect";
import { TestClock } from "effect/testing";
import type { InspectionFilesOperations } from "relkit/inspector-api/connection";
import { historyNativeFailure, InspectorHistoryNative } from "../src/history-native.service.js";
import { historyFailureHint } from "../src/tool-history.js";
import { readHistoryOwner } from "../src/history-owner.js";
import { acquireLiveEvents } from "../src/live-events.js";
import { inspectionLoop } from "../src/tool-loop.js";
import type { InspectorToolState } from "../src/tool-state.types.js";
import type { InspectorRemoteOperations } from "../src/remote.types.js";

const unavailable = () => Effect.die("Fixture must not use native I/O");
const files: InspectionFilesOperations = {
  projectId: () => Effect.succeed("project"),
  list: unavailable,
  read: unavailable,
  publish: unavailable,
  removeOwned: unavailable,
};
const remote: InspectorRemoteOperations = { request: unavailable, json: unavailable };
const lock = new Error(
  'IO Error: Could not set lock on file "/private/app/.relkit/observability/observability.duckdb": Conflicting lock is held in /usr/local/bin/bun (PID 20123) by user someone.',
);

/** Writes the record an Inspector leaves beside its history, naming a process that is alive. */
async function recordOwner(directory: string, record: unknown): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, ".inspector-owner.json"), JSON.stringify(record));
}

it.effect("a lock conflict names the other Inspector and where it listens", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-owner-")));
    yield* Effect.promise(() =>
      recordOwner(directory, { pid: process.ppid, url: "http://127.0.0.1:3341" }),
    );
    const owner = yield* readHistoryOwner(directory);
    const hint = historyFailureHint(historyNativeFailure(lock), owner);
    expect(hint).toContain("Another Inspector already holds this project's history");
    // The Inspector's own process, not the history worker the lock names.
    expect(hint).toContain(`PID ${process.ppid}`);
    expect(hint).not.toContain("PID 20123");
    expect(hint).toContain("http://127.0.0.1:3341");
    expect(hint).toContain("--history-directory");
    expect(hint).not.toContain("/private/app");
    yield* Effect.promise(() => rm(directory, { recursive: true, force: true }));
  }),
);

it.effect("a missing, stale, foreign or malformed record names no address", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-owner-")));
    expect(yield* readHistoryOwner(directory)).toBeUndefined();
    for (const record of [
      { pid: 2_147_483_000, url: "http://127.0.0.1:3341" },
      { pid: process.pid, url: "http://127.0.0.1:3341" },
      { pid: process.ppid, url: "https://user:pass@example.com/path" },
      { pid: process.ppid, url: "javascript:alert(1)" },
      { pid: "x", url: "http://127.0.0.1:3341" },
    ]) {
      yield* Effect.promise(() => recordOwner(directory, record));
      expect(yield* readHistoryOwner(directory)).toBeUndefined();
    }
    const hint = historyFailureHint(historyNativeFailure(lock), undefined);
    expect(hint).toContain("Another process already holds this project's history (PID 20123)");
    expect(hint).not.toContain("http");
    yield* Effect.promise(() => rm(directory, { recursive: true, force: true }));
  }),
);

it.effect("any other history failure is named once with its code", () =>
  Effect.sync(() => {
    const hint = historyFailureHint(historyNativeFailure(new Error("permission denied")));
    expect(hint).toContain("history.unavailable");
    expect(hint).not.toContain("permission denied");
  }),
);

it.effect(
  "the loop prints one plain notice and no error blocks while another holds the history",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-owner-")));
        yield* Effect.promise(() =>
          recordOwner(directory, { pid: process.ppid, url: "http://127.0.0.1:3341" }),
        );
        const logs: { level: string; message: string }[] = [];
        const logger = Logger.layer([
          Logger.make((event) => {
            logs.push({ level: event.logLevel, message: JSON.stringify(event.message) });
          }),
        ]);
        const entered = yield* Deferred.make<void>();
        const native = Layer.succeed(InspectorHistoryNative, {
          acquire: () =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Effect.fail(historyNativeFailure(lock))),
            ),
        });
        const current = yield* Ref.make<InspectorToolState>({
          selection: { state: "disconnected", rejected: 0 },
          history: undefined,
          sessionId: undefined,
          through: 0,
          error: undefined,
          incomplete: true,
          droppedRecords: 0,
        });
        const events = yield* acquireLiveEvents;
        const fiber = yield* Effect.forkChild(
          Effect.scoped(
            inspectionLoop(
              current,
              { select: () => Effect.succeed({ state: "disconnected", rejected: 0 }) },
              remote,
              files,
              {
                hostname: "127.0.0.1",
                port: 3210,
                projectRoot: "/fixture",
                historyDirectory: directory,
              },
              events,
            ),
          ).pipe(Effect.provide(Layer.merge(native, logger))),
        );
        yield* Deferred.await(entered);
        yield* TestClock.adjust(65_000);
        yield* Fiber.interrupt(fiber);
        const all = logs.map((entry) => entry.message).join("\n");
        expect(all).not.toContain("Execution operation failed");
        expect(all).not.toContain("Inspection history command failed");
        const notices = logs.filter((entry) => entry.level === "Warn");
        expect(notices).toHaveLength(2);
        expect(notices[0]!.message).toContain("Another Inspector already holds");
        expect(notices[0]!.message).toContain("http://127.0.0.1:3341");
        expect(notices[1]!.message).toContain("retrying every 30s");
        expect(logs.filter((entry) => entry.level === "Error")).toEqual([]);
        yield* Effect.promise(() => rm(directory, { recursive: true, force: true }));
      }),
    ),
);
