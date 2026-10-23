/** Verifies engine-owned generation lifetime, preserving the existing lifecycle contract. */
/** Exercises native host acquisition/drain barriers and cancellation without publishing late handles or replacing primary failures. */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createServerRuntimeHost } from "../../src/server-runtime/server-runtime-host.js";
import type { RedactedLogRecord } from "@relkit/runtime-effect";

it.live("drains uncancellable readiness work before releasing its worker handle", () =>
  Effect.promise(async () => {
    const host = await createServerRuntimeHost({ report: () => {} });
    const entered = Promise.withResolvers<void>();
    const complete = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    host.signal.addEventListener("abort", () => aborted.resolve(), { once: true });
    let released = 0;
    await host.resource(
      "native-job-registration",
      async () => 1,
      () => {
        released++;
      },
      undefined,
      "worker",
    );
    const ready = host
      .retry("native-job-ready", async () => {
        entered.resolve();
        await complete.promise;
        expect(released).toBe(0);
      })
      .catch(() => undefined);
    await entered.promise;
    const shutdown = host.shutdown(async () => {});
    await aborted.promise;
    expect(released).toBe(0);
    complete.resolve();
    await Promise.all([ready, shutdown]);
    expect(released).toBe(1);
  }),
);

it.live("late cleanup and throwing report sink preserve the cancellation result", () =>
  Effect.promise(async () => {
    const releaseError = new Error("release failed");
    const sinkError = new Error("sink failed");
    const host = await createServerRuntimeHost({
      report: () => {
        throw sinkError;
      },
    });
    const acquired = Promise.withResolvers<number>();
    const entered = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    host.signal.addEventListener("abort", () => aborted.resolve(), { once: true });
    let releaseWasPrimary = false,
      sinkWasPrimary = false;
    const startup = host
      .resource(
        "provider",
        async () => {
          entered.resolve();
          return acquired.promise;
        },
        () => {
          throw releaseError;
        },
      )
      .catch((failure) => {
        releaseWasPrimary = failure === releaseError;
        sinkWasPrimary = failure === sinkError;
      });
    await entered.promise;
    const shutdown = host.shutdown(async () => {});
    await aborted.promise;
    acquired.resolve(1);
    await Promise.all([startup, shutdown]);
    expect(releaseWasPrimary).toBe(false);
    expect(sinkWasPrimary).toBe(false);
    expect(host.snapshot().cleanupFailures.some((failure) => failure.cause === releaseError)).toBe(
      true,
    );
  }),
);

it.live("late uncancellable acquisition releases exactly once without publishing a handle", () =>
  Effect.promise(async () => {
    const host = await createServerRuntimeHost({ report: () => {} });
    const acquired = Promise.withResolvers<{ readonly id: number }>();
    const entered = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    host.signal.addEventListener("abort", () => aborted.resolve(), { once: true });
    let released = 0;
    let published = false;
    const startup = host
      .resource(
        "provider",
        async () => {
          entered.resolve();
          return acquired.promise;
        },
        () => {
          released++;
        },
      )
      .then(
        () => {
          published = true;
        },
        () => undefined,
      );
    await entered.promise;
    const shutdown = host.shutdown(async () => {});
    await aborted.promise;
    acquired.resolve({ id: 1 });
    await Promise.all([startup, shutdown]);
    expect(released).toBe(1);
    expect(published).toBe(false);
    expect(host.snapshot().stopping).toBe(true);
  }),
);

it.live("delayed initialization drains before release and cannot revive readiness", () =>
  Effect.promise(async () => {
    const host = await createServerRuntimeHost({ report: () => {} });
    const entered = Promise.withResolvers<void>();
    const complete = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    host.signal.addEventListener("abort", () => aborted.resolve(), { once: true });
    let released = 0;
    let published = false;
    const startup = host
      .resource(
        "provider",
        async () => ({ id: 1 }),
        () => {
          released++;
        },
        async () => {
          entered.resolve();
          await complete.promise;
          expect(released).toBe(0);
          host.setReady("provider", true);
        },
      )
      .then(
        () => {
          published = true;
        },
        () => undefined,
      );
    await entered.promise;
    const shutdown = host.shutdown(async () => {});
    await aborted.promise;
    expect(released).toBe(0);
    complete.resolve();
    await Promise.all([startup, shutdown]);
    expect(released).toBe(1);
    expect(published).toBe(false);
    expect(host.snapshot().ready.provider).toBe(false);
  }),
);
