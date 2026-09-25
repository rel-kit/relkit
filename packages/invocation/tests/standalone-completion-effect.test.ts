import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  createStandaloneFinisher,
  createStandaloneFinisherEffect,
} from "../src/standalone-completion.js";
import type { InvocationRecord } from "../src/index.js";

const record: InvocationRecord = {
  id: "invocation-1",
  functionId: "tasks.run",
  traceId: "trace-1",
  startedAt: new Date(100).toISOString(),
  attempt: 1,
  source: "direct",
  status: "started",
};

describe("standalone completion", () => {
  test("Effect finalizer settles once and runs lifecycle hooks", async () => {
    const events: string[] = [];
    const handle = Effect.runSync(
      createStandaloneFinisherEffect({
        record,
        options: {
          onCompletion: ({ record: completed }) => {
            events.push(completed.status);
          },
          onRelease: () => {
            events.push("release");
          },
        },
        now: () => 200,
        settleProgress: () => {
          events.push("progress");
        },
        unlink: () => {
          events.push("unlink");
        },
      }),
    );
    await Effect.runPromise(handle.finishEffect("success", undefined));
    await handle.finish("defect", undefined);
    expect(events).toEqual(["progress", "success", "release", "unlink"]);
  });

  test("Promise adapter absorbs observational hook failure", async () => {
    let unlinked = false;
    const finish = createStandaloneFinisher({
      record,
      options: {
        onCompletion: () => {
          throw new Error("hook failed");
        },
      },
      now: () => 200,
      settleProgress: undefined,
      unlink: () => {
        unlinked = true;
      },
    });
    await expect(finish("success", undefined)).resolves.toBeUndefined();
    expect(unlinked).toBe(true);
  });

  test("unlinks after an earlier finalization stage fails", async () => {
    const events: string[] = [];
    const handle = Effect.runSync(
      createStandaloneFinisherEffect({
        record,
        options: {},
        now: () => 200,
        settleProgress: () => {
          throw new Error("progress settlement failed");
        },
        unlink: () => {
          events.push("unlink");
        },
      }),
    );
    await expect(Effect.runPromise(handle.finishEffect("success", undefined))).rejects.toThrow(
      "progress settlement failed",
    );
    await Effect.runPromise(handle.finishEffect("success", undefined));
    expect(events).toEqual(["unlink"]);
  });

  test("a concurrent finish waits for release already in progress", async () => {
    const events: string[] = [];
    let enterCompletion!: () => void;
    let leaveCompletion!: () => void;
    const entered = new Promise<void>((resolve) => {
      enterCompletion = resolve;
    });
    const released = new Promise<void>((resolve) => {
      leaveCompletion = resolve;
    });
    const handle = Effect.runSync(
      createStandaloneFinisherEffect({
        record,
        options: {
          onCompletion: async () => {
            enterCompletion();
            await released;
          },
          onRelease: () => {
            events.push("release");
          },
        },
        now: () => 200,
        settleProgress: undefined,
        unlink: () => {
          events.push("unlink");
        },
      }),
    );
    const first = Effect.runPromise(handle.finishEffect("success", undefined));
    await entered;
    let secondDone = false;
    const second = Effect.runPromise(handle.finishEffect("defect", undefined)).then(() => {
      secondDone = true;
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(secondDone).toBe(false);
    } finally {
      leaveCompletion();
    }
    await Promise.all([first, second]);
    expect(events).toEqual(["release", "unlink"]);
  });
});
