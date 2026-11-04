/** Verifies emitted hosts load integrations through Promise APIs that keep `effect` out of applications. */
import { expect, it } from "vitest";
import * as host from "../../src/app/host.js";
import { SelectedDependencyInitializationFailure } from "../../src/provider/dependency-preflight.service.js";

it("exposes only Promise helpers for selected integrations", () => {
  expect(Object.keys(host).sort()).toEqual([
    "bindDescriptorIdentity",
    "checkRuntimeIntegrations",
    "createApplicationContextResolver",
    "loadRuntimeIntegration",
  ]);
});

it("checks an empty plan and loads a module through Promises", async () => {
  await expect(
    host.checkRuntimeIntegrations(
      { version: 1, graphHash: "hash", integrations: [] },
      { projectRoot: process.cwd(), phase: "runtime" },
    ),
  ).resolves.toBeUndefined();
  await expect(
    host.loadRuntimeIntegration("@relkit/x", async () => ({ ok: true })),
  ).resolves.toEqual({
    ok: true,
  });
});

it("names the integration package when its module fails to load", async () => {
  const failure = await host
    .loadRuntimeIntegration("@relkit/x", async () => {
      throw new Error("boom");
    })
    .then(
      () => undefined,
      (error: unknown) => error,
    );
  expect(failure).toBeInstanceOf(SelectedDependencyInitializationFailure);
  expect(failure).toMatchObject({ package: "@relkit/x" });
});
