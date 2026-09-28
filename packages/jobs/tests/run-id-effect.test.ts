import { Effect, Layer, Result } from "effect";
import { expect, test } from "vitest";
import { JobsTelemetry } from "../src/jobs-observability.ts";
import {
  createRunLocatorEffect,
  namespaceHash,
  namespaceHashEffect,
  rotateRunLocatorKeysEffect,
  RunLocatorError,
  RunLocatorFailure,
  validateRunLocatorKeyRing,
  validateRunLocatorKeyRingEffect,
  verifyRunLocatorEffect,
} from "../src/run-id.ts";
import { RunLocatorRouter, runLocatorStoreLayer } from "../src/run-id-router.ts";
const keyRing = { activeKeyId: "v1", keys: { v1: "secret" } } as const;
const payload = {
  application: "commerce",
  environment: "test",
  serviceGeneration: "current",
  jobId: "job-1",
  taskId: "task-1",
  taskVersion: "1",
  buildId: "build-1",
  scope: "tenant:one",
  namespaceHash: namespaceHash("commerce", "test", "tenant:one"),
  native: { kind: "run", value: "native-1" },
};
test("Effect signs, verifies, and rotates run locator keys", async () => {
  const seen: string[] = [];
  const layer = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  const locator = await Effect.runPromise(
    Effect.provide(createRunLocatorEffect({ payload, keyRing }), layer),
  );
  const verified = await Effect.runPromise(
    Effect.provide(
      verifyRunLocatorEffect(locator, {
        keyRing,
        scope: "tenant:one",
      }),
      layer,
    ),
  );
  expect(verified.native.value).toBe("native-1");
  const rotated = await Effect.runPromise(
    Effect.provide(rotateRunLocatorKeysEffect(keyRing, "v2", "new-secret"), layer),
  );
  expect(rotated.activeKeyId).toBe("v2");
  expect(seen).toEqual(["runLocator.create", "runLocator.verify", "runLocator.rotate"]);
});
test("mismatched namespace is a tagged Effect failure", async () => {
  const locator = await Effect.runPromise(createRunLocatorEffect({ payload, keyRing }));
  const result = await Effect.runPromise(
    Effect.result(
      verifyRunLocatorEffect(locator, {
        keyRing,
        scope: "tenant:two",
      }),
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(RunLocatorFailure);
});
test("router loads and persists through a substitute storage Layer", async () => {
  let saved = 0;
  const store = {
    load: () => [{ generation: "current", keyRing }],
    save: () => {
      saved++;
    },
  };
  const layer = runLocatorStoreLayer(store);
  const router = await Effect.runPromise(Effect.provide(RunLocatorRouter.fromStoreEffect(), layer));
  const locator = await Effect.runPromise(createRunLocatorEffect({ payload, keyRing }));
  expect((await Effect.runPromise(router.routeEffect(locator))).serviceGeneration).toBe("current");
  expect(Effect.runSync(router.snapshotEffect())).toHaveLength(1);
  await Effect.runPromise(Effect.provide(router.persistEffect(), layer));
  expect(saved).toBe(1);
  const invalid = await Effect.runPromise(
    Effect.result(router.registerEffect("bad generation", keyRing)),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(RunLocatorFailure);
});
test("public namespace and key-ring helpers run through typed Effect paths", async () => {
  const seen: string[] = [];
  const layer = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  const hash = await Effect.runPromise(
    Effect.provide(namespaceHashEffect("commerce", "test", "tenant:one"), layer),
  );
  expect(hash).toBe(namespaceHash("commerce", "test", "tenant:one"));
  await Effect.runPromise(Effect.provide(validateRunLocatorKeyRingEffect(keyRing), layer));
  expect(() => validateRunLocatorKeyRing({ activeKeyId: "missing", keys: {} })).toThrow(
    RunLocatorError,
  );
  const invalid = await Effect.runPromise(
    Effect.result(namespaceHashEffect("", "test", "tenant:one")),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(RunLocatorFailure);
  expect(seen).toEqual(["runLocator.namespaceHash", "runLocator.validateKeyRing"]);
});
