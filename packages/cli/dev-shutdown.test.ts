import { expect, test } from "bun:test";
import { shutdownDev } from "./src/commands/dev-shutdown.js";
import type { DevSession } from "./src/commands/dev-session.js";

test("shutdown stops the inspector while the proxy waits for its requests to close", async () => {
  let closeRequest!: () => void;
  const pendingRequest = new Promise<void>((resolve) => {
    closeRequest = resolve;
  });
  let inspectorStopped = false;
  let finished = false;
  const session = {
    markStopping() {},
    log() {},
    abortController: new AbortController(),
    options: {},
    controllers: [],
    proxy: { stop: () => pendingRequest },
    inspectorChild: {
      stop: async () => {
        inspectorStopped = true;
        closeRequest();
      },
      output: Promise.resolve(),
    },
    pendingActivations: Promise.resolve(true),
    drains: new Map(),
    observability: { flush: async () => {} },
    clearSignals() {},
    resolveShutdownPromise() {},
  } as unknown as DevSession;
  const stopped = shutdownDev(session, new Error("Framework reload")).then(() => {
    finished = true;
  });
  try {
    await Promise.race([stopped, Bun.sleep(100)]);
    expect(inspectorStopped).toBe(true);
    expect(finished).toBe(true);
  } finally {
    closeRequest();
    await stopped;
  }
});
