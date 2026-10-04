import { afterEach, expect, test } from "bun:test";
import { createSupervisorWatcher } from "../../src/watcher.js";
import type { SupervisorWatcher, SupervisorWatcherOptions } from "../../src/watcher.js";
import type { RecordedWatcherBatch } from "../fixtures/watcher.types.js";

const owners: SupervisorWatcher[] = [];
const pendingFixtures: (() => void)[] = [];

afterEach(async () => {
  const closing = owners.splice(0).map((owner) => owner.close());
  pendingFixtures.splice(0).forEach((settle) => settle());
  await Promise.all(closing);
});

/** Registers a native watcher fixture for cleanup even after a failed assertion.
 * @param options - Compiler and debounce fixture. @returns The owned watcher. */
function ownWatcher(options: SupervisorWatcherOptions): SupervisorWatcher {
  const watcher = createSupervisorWatcher(options);
  owners.push(watcher);
  return watcher;
}

test("debounces source changes and compiles the newest coalesced batch", async () => {
  const requests: RecordedWatcherBatch[] = [];
  const watcher = ownWatcher({
    debounceMs: 100,
    compile: ({ version, changedFiles }) => {
      requests.push({ version, changedFiles });
    },
  });

  watcher.notify({ version: 1, changedFiles: ["src/one.ts"] });
  watcher.notify({ version: 2, changedFiles: ["src/two.ts"] });
  await watcher.flush();

  expect(requests).toEqual([{ version: 2, changedFiles: ["src/one.ts", "src/two.ts"] }]);
  expect(watcher.stateMachine.state).toBe("starting-candidate");
});

test("aborts and obsoletes a compile when a newer source version arrives", async () => {
  const resolvers = new Map<number, () => void>();
  const signals = new Map<number, AbortSignal>();
  pendingFixtures.push(() => resolvers.forEach((resolve) => resolve()));
  const watcher = ownWatcher({
    compile: ({ version, signal }) =>
      new Promise<void>((resolve) => {
        resolvers.set(version, resolve);
        signals.set(version, signal);
      }),
  });

  watcher.notify({ version: 1 });
  const firstRun = watcher.flush();
  await Promise.resolve();
  watcher.notify({ version: 2 });
  expect(signals.get(1)?.aborted).toBe(true);

  resolvers.get(1)?.();
  while (!resolvers.has(2)) await new Promise((resolve) => setTimeout(resolve, 0));
  resolvers.get(2)?.();
  await firstRun;

  expect(watcher.stateMachine.snapshot().candidate?.sourceToken).toBe(2);
  expect(watcher.stateMachine.state).toBe("starting-candidate");
  expect(watcher.stateMachine.telemetry).toContainEqual(
    expect.objectContaining({ outcome: "candidate-stale", sourceToken: 1 }),
  );
});

test("ignores an out-of-order source version", async () => {
  let compiled = 0;
  const watcher = ownWatcher({
    compile: () => {
      compiled += 1;
    },
  });

  watcher.notify({ version: 2 });
  expect(watcher.notify({ version: 1 })).toBeUndefined();
  await watcher.flush();

  expect(compiled).toBe(1);
  expect(watcher.version).toBe(2);
});

test("runs a queued change after its debounce expires during compilation", async () => {
  const resolvers = new Map<number, () => void>();
  pendingFixtures.push(() => resolvers.forEach((resolve) => resolve()));
  const watcher = ownWatcher({
    compile: ({ version }) =>
      new Promise<void>((resolve) => {
        resolvers.set(version, resolve);
      }),
  });

  watcher.notify({ version: 1 });
  await waitFor(() => resolvers.has(1));
  watcher.notify({ version: 2 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  resolvers.get(1)?.();
  await waitFor(() => resolvers.has(2));
  resolvers.get(2)?.();
  await waitFor(() => watcher.stateMachine.snapshot().candidate?.sourceToken === 2);

  expect(watcher.version).toBe(2);
  watcher.dispose();
});

/** Waits for a native watcher fixture transition. @param check - Fixture predicate.
 * @returns Once observed, or rejects at the retained 500 ms native deadline. */
async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 500;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for queued compilation.");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
