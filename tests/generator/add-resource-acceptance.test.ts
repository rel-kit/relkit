/** Verifies grouped scaffolding through installed public creation/addition APIs. */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { checkProject } from "../../packages/cli/src/commands/check.ts";
import { createRegistrationPlan, type ApplicationGraph } from "../../packages/graph/src/index.ts";
import {
  ADD_FAILURE_CODES,
  normalizeAddRequest,
  planAdd,
} from "../../packages/create-relkit/src/index.ts";
import { project, add, linkDependencies, releaseVersion } from "./add-acceptance-fixture.js";
import { registerAddCleanup } from "./add-acceptance-fixture.js";

registerAddCleanup();

test("reused Docker profiles retain the post-scaffold startup reminder", async () => {
  const root = await project("minimal");
  await add(root, ["service", "Orders", "--full"]);
  for (const args of [
    ["cache", "Lookup", "--service", "orders", "--profile", "local"],
    ["cache", "Lookup", "--service", "orders", "--provider", "redis", "--source", "docker"],
  ]) {
    const plan = await planAdd(normalizeAddRequest([...args, "--project-root", root]));
    expect(plan.profiles).toEqual([]);
    expect(plan.warnings).toContainEqual(expect.objectContaining({ code: "docker-required" }));
    expect(plan.nextSteps).toContain("relkit local up");
    expect(plan.operations.some((operation) => operation.path === "relkit.config.ts")).toBe(false);
  }
  const connected = await planAdd(
    normalizeAddRequest([
      "cache",
      "Remote",
      "--service",
      "orders",
      "--provider",
      "redis",
      "--source",
      "connected",
      "--project-root",
      root,
    ]),
  );
  expect(connected.warnings.some((warning) => warning.code === "docker-required")).toBe(false);
  await expect(
    planAdd(
      normalizeAddRequest([
        "bucket",
        "Uploads",
        "--service",
        "orders",
        "--profile",
        "local",
        "--project-root",
        root,
      ]),
    ),
  ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.collision });
  await add(root, ["service", "Billing", "--full"]);
  await linkDependencies(root);
  expect((await checkProject({ projectRoot: root })).diagnostics).toEqual([]);
});
