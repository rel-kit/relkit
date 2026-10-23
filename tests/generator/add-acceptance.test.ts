/** Verifies grouped scaffolding through installed public creation/addition APIs. */
import { expect } from "bun:test";
import { join } from "node:path";
import {
  ADD_FAILURE_CODES,
  normalizeAddRequest,
  planAdd,
} from "../../packages/cli/src/scaffolding/index.ts";
import { project, releaseVersion } from "./add-acceptance-fixture.js";
import { registerAddCleanup, addTest as test } from "./add-acceptance-fixture.js";

registerAddCleanup();

test("tool function creation rejects collisions without changing existing files", async () => {
  const root = await project("minimal");
  const path = join(root, "src/services/hello/functions/hello.function.ts");
  const original = await Bun.file(path).text();
  await expect(
    planAdd(
      normalizeAddRequest([
        "tool",
        "Lookup",
        "--service",
        "hello",
        "--create-function",
        "hello",
        "--project-root",
        root,
      ]),
    ),
  ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.collision });
  expect(await Bun.file(path).text()).toBe(original);
  expect(await Bun.file(join(root, "src/services/hello/tools/lookup.tool.ts")).exists()).toBe(
    false,
  );
});

test("snapshots simple, custom, and full service plans", async () => {
  const variants = [
    ["service", "Billing"],
    ["service", "Billing", "--include", "function", "--include", "event", "--include", "tool"],
    ["service", "Billing", "--full"],
  ];
  for (const args of variants) {
    const root = await project("minimal");
    const plan = await planAdd(
      normalizeAddRequest([...args, "--project-root", root, "--no-install"]),
    );
    const snapshot = {
      operations: plan.operations.map((operation) =>
        "content" in operation
          ? { ...operation, content: operation.content.split("\n") }
          : operation,
      ),
      dependencies: plan.dependencies,
      artifacts: plan.artifacts,
      profiles: plan.profiles,
      warnings: plan.warnings,
      nextSteps: plan.nextSteps,
    };
    expect(
      JSON.parse(JSON.stringify(snapshot).replaceAll(releaseVersion, "<release-version>")),
    ).toMatchSnapshot();
  }
});

test("rejects ambiguous services and existing route methods before mutation", async () => {
  const root = await project("api");
  await expect(
    planAdd(normalizeAddRequest(["function", "Ambiguous", "--project-root", root])),
  ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.usage });
  await expect(
    planAdd(
      normalizeAddRequest([
        "route",
        "/hello",
        "--mode",
        "service-route",
        "--service",
        "hello",
        "--map",
        "GET=hello",
        "--project-root",
        root,
      ]),
    ),
  ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.collision });
});
