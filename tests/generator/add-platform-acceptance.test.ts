/** Verifies grouped scaffolding through installed public creation/addition APIs. */
import { expect } from "bun:test";
import { join } from "node:path";
import { checkProject } from "../../packages/cli/src/commands/check.ts";
import { createRegistrationPlan, type ApplicationGraph } from "../../packages/graph/src/index.ts";
import {
  ADD_FAILURE_CODES,
  normalizeAddRequest,
  planAdd,
} from "../../packages/cli/src/scaffolding/index.ts";
import { project, add, linkDependencies, releaseVersion } from "./add-acceptance-fixture.js";
import { registerAddCleanup, addTest as test } from "./add-acceptance-fixture.js";

registerAddCleanup();

test("route platform and singleton additions compile in every starter", async () => {
  for (const template of ["minimal", "api", "agent", "fullstack"] as const) {
    const root = await project(template);
    await add(root, ["route", "/users/:id/details", "--mode", "route"]);
    await add(root, ["middleware", "Request Log", "--path", "/users/*"]);
    await add(root, ["transform", "Trim Input"]);
    await add(root, ["database", "--dialect", "sqlite", "--no-install"]);
    await add(root, ["auth", "--database-dialect", "sqlite", "--no-install"]);
    await linkDependencies(root);
    const result = await checkProject({ projectRoot: root });
    expect(result.diagnostics).toEqual([]);
    expect(await Bun.file(join(root, "src/routes/users/[id]/details/route.ts")).exists()).toBe(
      true,
    );
    const operation = JSON.parse(result.outputs.openapi).paths["/users/{id}/details"].get;
    expect(operation.responses).toEqual({
      default: { description: "Response returned by the route handler" },
    });
    expect(operation["x-relkit"]).not.toHaveProperty("functionId");
    expect(await Bun.file(join(root, "src/routes/api/auth/[[...auth]]/route.ts")).exists()).toBe(
      true,
    );
  }
}, 30_000);

test("database and auth-chained schemas compile for all Bun-native dialects", async () => {
  for (const dialect of ["sqlite", "postgresql", "mysql"] as const) {
    for (const kind of ["database", "auth"] as const) {
      const root = await project("minimal");
      const option = kind === "database" ? "--dialect" : "--database-dialect";
      await add(root, [kind, option, dialect, "--no-install"]);
      await linkDependencies(root);
      expect((await checkProject({ projectRoot: root })).diagnostics).toEqual([]);
    }
  }
}, 30_000);
