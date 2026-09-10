import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCommand } from "./pack-and-smoke-create-relkit-support.js";

export async function verifyScaffoldBuild(root: string): Promise<void> {
  if (process.env.RELKIT_TEST_DOCKER !== "1") {
    await runCommand(["run", "build"], root);
    return;
  }
  // Local-only Docker bindings must not silently become production deployment sources.
  await assert.rejects(
    runCommand(["run", "build"], root),
    /RELKIT_PROVIDER_RELEASE_SOURCE_REQUIRED/,
  );
}

export async function exerciseScaffoldRoutes(
  root: string,
  port: number,
  cli: string,
): Promise<void> {
  const base = `http://127.0.0.1:${port}`;
  const request = async (path: string) => {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5_000) });
    assert.equal(response.status, 200, `${path}: ${await response.clone().text()}`);
    return response;
  };
  assert.deepEqual(await (await request("/billing?value=smoke")).json(), { value: "smoke" });
  const routePath = "src/routes/live/[id]/details/route.ts";
  if (!existsSync(join(root, routePath))) {
    const result = JSON.parse(
      await runCommand(
        [cli, "--json", "add", "route", "/live/:id/details", "--mode", "route"],
        root,
      ),
    );
    assert.equal(result.ok, true);
  }
  let ready = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    const response = await fetch(`${base}/live/42/details`, { signal: AbortSignal.timeout(2_000) });
    if (response.status === 200) {
      ready = true;
      break;
    }
    // The last-known-good backend must remain available during a rebuild.
    await request("/billing?value=smoke");
    await Bun.sleep(50);
  }
  assert.ok(ready, "Route added during dev never became available");
  const document = (await (await request("/_relkit/v1/openapi.json")).json()) as {
    paths: Record<string, unknown>;
  };
  assert.ok(document.paths["/billing"]);
  assert.ok(document.paths["/live/{id}/details"]);
  assert.match(await (await request("/_relkit/v1/api-reference")).text(), /scalar/i);
  if (existsSync(join(root, "src/shipping/service.ts")))
    assert.deepEqual(await (await request("/shipping?value=second")).json(), { value: "second" });
}
