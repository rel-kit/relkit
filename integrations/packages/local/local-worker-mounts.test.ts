import { expect, test } from "bun:test";
import type { NormalizedLocalServiceRecipe } from "relkit/local-service";
import { workerStartOptions } from "./src/runtime/reconciler-worker.ts";

test("worker containers see project packages where Bun resolves them without NODE_PATH", () => {
  const recipe = {
    units: [{ id: "worker", kind: "worker" }],
  } as unknown as NormalizedLocalServiceRecipe;
  const options = workerStartOptions(recipe, {
    entrypoint: "/project/.relkit/generated/generation-1/server/index.js",
    providerOverridesFile: "/project/.relkit/state/local/worker-provider-overrides.json",
    nodeModulesDirectory: "/project/node_modules",
  });
  expect(options.bindMounts?.worker).toContainEqual({
    source: "/project/node_modules",
    target: "/node_modules",
    readOnly: true,
  });
  expect(options.bindMounts?.worker).toContainEqual({
    source: "/project/.relkit/generated/generation-1",
    target: "/relkit-worker",
    readOnly: true,
  });
  expect(options.environmentVariablesByUnit?.worker?.NODE_PATH).toBe("/node_modules");
});
