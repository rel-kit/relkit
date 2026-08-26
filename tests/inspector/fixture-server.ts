import { createInspectorFixture } from "./fixture-backend.ts";

const port = Number(process.env.ZSYS_FIXTURE_PORT ?? "3212");
const fixture = createInspectorFixture();
Bun.serve({
  port,
  idleTimeout: 30,
  fetch: fixture.app.fetch,
});
console.log(`Inspector fixture backend listening on http://127.0.0.1:${port}`);

await new Promise<void>(() => undefined);
