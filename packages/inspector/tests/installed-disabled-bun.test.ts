/** An available standalone package cannot enable application inspection by being installed. */
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { generatedAppFixture } from "../../../tests/fixtures/inspector/generated-app.js";

test("installed tool plus omitted inspection leaves the backend lean and core HTTP usable", async () => {
  const fixture = await generatedAppFixture(false);
  try {
    expect(
      existsSync(join(fixture.projectRoot, "node_modules/@relkit/inspector/package.json")),
    ).toBe(true);
    const base = `http://127.0.0.1:${fixture.session.backendPort}`;
    const hello = await fetch(`${base}/hello?name=Disabled`);
    expect(hello.status).toBe(200);
    expect(await hello.text()).toContain("Disabled");
    const graph = await fetch(`${base}/_relkit/v1/graph`);
    expect(graph.status).toBe(200);
    await graph.arrayBuffer();
    const rich = await fetch(`${base}/_relkit/v1/runtime`);
    expect(rich.status).toBe(404);
    await rich.arrayBuffer();
    expect(existsSync(join(fixture.projectRoot, ".relkit/connections"))).toBe(false);
    expect(
      existsSync(join(fixture.projectRoot, ".relkit/observability/observability.duckdb")),
    ).toBe(false);
  } finally {
    await fixture.close();
  }
}, 30_000);
