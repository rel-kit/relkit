import { expect, test } from "bun:test";
import { createSupervisorWatcher } from "./src/watcher.js";

test("debounces source changes and compiles the newest coalesced batch", async () => {
  const requests: Array<{ version: number; changedFiles: readonly string[] }> = [];
  const watcher = createSupervisorWatcher({
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
  const watcher = createSupervisorWatcher({
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
  const watcher = createSupervisorWatcher({
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
