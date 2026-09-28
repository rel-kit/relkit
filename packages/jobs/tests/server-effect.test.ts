import { expect, test } from "vitest";
import { Effect, Fiber, Layer, Result } from "effect";
import type { JobsAdapterRuntime } from "../src/adapter.ts";
import { createJobsRuntime, currentJobsRuntime } from "../src/runtime.ts";
import {
  JobsManifestReader,
  JobsServerError,
  readJobsManifestEffect,
} from "../src/server-manifest.ts";
import { runWithJobs, runWithJobsEffect } from "../src/server.ts";

const reader = (contents: string) =>
  Layer.succeed(
    JobsManifestReader,
    JobsManifestReader.of({ read: () => Effect.succeed(contents) }),
  );

function adapter(onClose: () => void): JobsAdapterRuntime {
  return {
    kind: "jobs-adapter-runtime",
    protocolVersion: 1,
    capabilities: { service: "test", features: {} },
    submit: async () => {
      throw new Error("unused");
    },
    get: async () => {
      throw new Error("unused");
    },
    list: async () => {
      throw new Error("unused");
    },
    observe: async function* () {},
    cancel: async () => {
      throw new Error("unused");
    },
    close: async () => onClose(),
  } as JobsAdapterRuntime;
}

test("decodes a manifest and reports typed malformed input", async () => {
  const config = { projectRoot: "/test" };
  expect(
    await Effect.runPromise(
      Effect.provide(
        readJobsManifestEffect(config),
        reader('{"protocol":"relkit.jobs-manifest","version":1}'),
      ),
    ),
  ).toMatchObject({ version: 1 });
  const invalid = await Effect.runPromise(
    Effect.result(Effect.provide(readJobsManifestEffect(config), reader("[]"))),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) {
    expect(invalid.failure).toBeInstanceOf(JobsServerError);
    expect(invalid.failure.operation).toBe("parseManifest");
  }
});

test("an owned runtime closes after success and callback failure", async () => {
  let closes = 0;
  const config = { projectRoot: "/test", adapter: adapter(() => closes++) };
  const success = await Effect.runPromise(
    Effect.provide(
      runWithJobsEffect(config, () => currentJobsRuntime()?.service),
      reader("{}"),
    ),
  );
  expect(success).toBe("test");
  expect(closes).toBe(1);
  const failed = await Effect.runPromise(
    Effect.result(
      Effect.provide(
        runWithJobsEffect(config, () => {
          throw new Error("callback failed");
        }),
        reader("{}"),
      ),
    ),
  );
  expect(Result.isFailure(failed)).toBe(true);
  if (Result.isFailure(failed)) {
    expect(failed.failure.operation).toBe("callback");
  }
  expect(closes).toBe(2);
});

test("interruption releases an owned runtime and a borrowed runtime remains open", async () => {
  let closes = 0;
  let started!: () => void;
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  const runtimeConfig = { projectRoot: "/test", adapter: adapter(() => closes++) };
  const fiber = Effect.runFork(
    Effect.provide(
      runWithJobsEffect(runtimeConfig, () => {
        started();
        return new Promise<never>(() => undefined);
      }),
      reader("{}"),
    ),
  );
  await begun;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(closes).toBe(1);

  const borrowed = createJobsRuntime({ adapter: adapter(() => closes++) });
  expect(
    await Effect.runPromise(
      Effect.provide(
        runWithJobsEffect({ projectRoot: "/test", runtime: borrowed }, () => "borrowed"),
        reader("{}"),
      ),
    ),
  ).toBe("borrowed");
  expect(closes).toBe(1);
});

test("Promise adapter preserves the original callback error", async () => {
  const error = new Error("callback failed");
  const runtimeConfig = { projectRoot: "/test", adapter: adapter(() => undefined) };
  await expect(
    runWithJobs(runtimeConfig, () => {
      throw error;
    }),
  ).rejects.toBe(error);
});
