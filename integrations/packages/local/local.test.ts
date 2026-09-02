import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LOCAL_SERVICE_PLAN_FILE,
  LOCAL_SERVICE_PLAN_VERSION,
  LOCAL_SERVICE_PROTOCOL_VERSION,
  LOCAL_SERVICE_STATE_VERSION,
  type LocalServicePlan,
  type LocalServiceState,
} from "./src/index.ts";
import {
  createLocalProjectIdentity,
  LOCAL_RESOURCE_LABEL,
  localResourceLabels,
} from "./src/runtime/index.ts";

test("exposes generic local-service plan and state contracts", () => {
  const plan = {
    version: LOCAL_SERVICE_PLAN_VERSION,
    graphHash: "sha256:graph",
    services: [],
  } satisfies LocalServicePlan;
  const state = {
    version: LOCAL_SERVICE_STATE_VERSION,
    applicationId: "commerce",
    localProjectId: "sha256:project",
    planHash: "sha256:plan",
    services: [],
  } satisfies LocalServiceState;

  expect(LOCAL_SERVICE_PROTOCOL_VERSION).toBe(1);
  expect(LOCAL_SERVICE_PLAN_FILE).toBe("local-services.plan.json");
  expect(plan.services).toEqual([]);
  expect(state.services).toEqual([]);
});

test("derives canonical clone-safe identity and complete Docker labels", () => {
  const temporary = mkdtempSync(join(tmpdir(), "relkit-local-identity-"));
  try {
    const first = join(temporary, "first");
    const second = join(temporary, "second");
    const alias = join(temporary, "alias");
    mkdirSync(first);
    mkdirSync(second);
    symlinkSync(first, alias);
    const identity = createLocalProjectIdentity(first, "commerce");

    expect(createLocalProjectIdentity(alias, "commerce")).toEqual(identity);
    expect(createLocalProjectIdentity(second, "commerce").localProjectId).not.toBe(
      identity.localProjectId,
    );
    expect(createLocalProjectIdentity(first, "other-app").localProjectId).not.toBe(
      identity.localProjectId,
    );
    expect(() =>
      localResourceLabels(
        { ...identity, localProjectId: `sha256:${"0".repeat(64)}` },
        {
          bindingId: "provider.cache.default",
          recipe: { integrationId: "redis", recipeId: "redis-docker", recipeVersion: 1 },
          planHash: `sha256:${"a".repeat(64)}`,
        },
      ),
    ).toThrow("Local project identity is invalid");
    expect(
      localResourceLabels(identity, {
        bindingId: "provider.cache.default",
        recipe: { integrationId: "redis", recipeId: "redis-docker", recipeVersion: 1 },
        planHash: `sha256:${"a".repeat(64)}`,
      }),
    ).toEqual({
      [LOCAL_RESOURCE_LABEL.managed]: "true",
      [LOCAL_RESOURCE_LABEL.applicationId]: "commerce",
      [LOCAL_RESOURCE_LABEL.localProjectId]: identity.localProjectId,
      [LOCAL_RESOURCE_LABEL.bindingId]: "provider.cache.default",
      [LOCAL_RESOURCE_LABEL.recipeId]: "redis:redis-docker:1",
      [LOCAL_RESOURCE_LABEL.planHash]: `sha256:${"a".repeat(64)}`,
    });
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
});
