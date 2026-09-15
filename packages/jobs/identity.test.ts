import { expect, test } from "bun:test";
import {
  createRunLocator,
  namespaceHash,
  rotateRunLocatorKeys,
  RunLocatorRouter,
  stableIdentityTuple,
} from "./src/index.ts";

test("keeps event-to-run identities and signing-key rotation stable", () => {
  const oldRing = { activeKeyId: "old", keys: { old: "old-secret" } } as const;
  const oldLocator = createRunLocator({
    keyRing: oldRing,
    payload: {
      application: "app",
      environment: "test",
      serviceGeneration: "generation-old",
      jobId: "jobs.events",
      taskId: "tasks.events",
      taskVersion: "1",
      buildId: "build-old",
      scope: "tenant-a",
      namespaceHash: namespaceHash("app", "test", "tenant-a"),
      schemaHash: "schema-old",
      native: { kind: "run", value: "native-1" },
    },
  });
  const rotated = rotateRunLocatorKeys(oldRing, "new", "new-secret");
  const newLocator = createRunLocator({
    keyRing: rotated,
    payload: {
      application: "app",
      environment: "test",
      serviceGeneration: "generation-new",
      jobId: "jobs.events",
      taskId: "tasks.events",
      taskVersion: "1",
      buildId: "build-new",
      scope: "tenant-a",
      namespaceHash: namespaceHash("app", "test", "tenant-a"),
      native: { kind: "run", value: "native-2" },
    },
  });
  const router = new RunLocatorRouter([
    { generation: "generation-old", keyRing: oldRing },
    { generation: "generation-new", keyRing: rotated },
  ]);
  expect(router.route(oldLocator, { application: "app", environment: "test", scope: "tenant-a" }).serviceGeneration).toBe("generation-old");
  expect(router.route(newLocator, { application: "app", environment: "test", scope: "tenant-a" }).serviceGeneration).toBe("generation-new");
  expect(stableIdentityTuple([1])).not.toBe(stableIdentityTuple(["1"]));
});
