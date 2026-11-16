/**
 * `context` of `createTestApplication` has the meaning it has in `createTestRuntime`: its fields
 * replace the handler context's defaults, here also the ones the application's services supply.
 */
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineEnv } from "relkit/config";
import { z } from "relkit/schema";
import { createTestApplication, type TestApplication } from "../../src/application.js";
import { createTestRuntime } from "../../src/runtime.js";

interface SeenContext {
  readonly tenant?: unknown;
  readonly database?: unknown;
  readonly auth: { readonly getSession: () => Promise<unknown> };
}

const readContext = {
  id: "testing.read-context",
  input: z.object({}),
  output: z.object({ tenant: z.string(), database: z.string(), user: z.string() }),
  handler: async (_input: object, context: SeenContext) => {
    const session = (await context.auth.getSession()) as { user?: { id?: string } } | null;
    return {
      tenant: String(context.tenant),
      database: String(context.database),
      user: String(session?.user?.id),
    };
  },
};
const session = { user: { id: "user-1" } };
let root: string | undefined;
let application: TestApplication | undefined;

afterEach(async () => {
  await application?.close();
  application = undefined;
  if (root !== undefined) await rm(root, { recursive: true, force: true });
});

test("the runtime gives handlers the fields passed as context", async () => {
  const runtime = createTestRuntime({
    app: { env: defineEnv({}) },
    context: { tenant: "acme", database: "from-test" },
  });
  try {
    expect(await runtime.invoke(readContext, {})).toMatchObject({
      tenant: "acme",
      database: "from-test",
    });
  } finally {
    await runtime.close();
  }
});

test("the application gives handlers the fields passed as context", async () => {
  root = await mkdtemp(join(tmpdir(), "relkit-context-option-"));
  await mkdir(join(root, "src/routes"), { recursive: true });
  // The application needs one route to load; the test calls the function directly.
  const route = new URL("../fixtures/application-cleanup-route.ts", import.meta.url).href;
  await writeFile(
    join(root, "src/routes/route.ts"),
    `export { cleanupRoute as ALL } from ${JSON.stringify(route)};`,
  );
  application = await createTestApplication(
    { env: defineEnv({}) },
    {
      projectRoot: root,
      context: { tenant: "acme", auth: { getSession: async () => session } },
      services: async () => ({
        context: { database: "from-service" },
        close: async () => undefined,
      }),
    },
  );
  expect(await application.runtime.invoke(readContext, {})).toEqual({
    tenant: "acme",
    // A field the test does not pass keeps the value the application's services supply.
    database: "from-service",
    // A field the test passes replaces the application's own, here the request session reader.
    user: "user-1",
  });
});
