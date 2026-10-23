/** Exercises the actual Bun public application close contract after native service release failure.
 * The test owns its empty project, application state and expected cleanup rejection.
 */
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineEnv } from "@relkit/config";
import { createTestApplication, type TestApplication } from "../../src/application.js";

test("public application close retains AggregateError and its memoized rejected Promise", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-close-failure-"));
  const cleanup = new Error("selected service release failed");
  let application: TestApplication | undefined;
  try {
    await mkdir(join(root, "src/routes"), { recursive: true });
    const route = new URL("../fixtures/application-cleanup-route.ts", import.meta.url).href;
    await writeFile(
      join(root, "src/routes/route.ts"),
      `export { cleanupRoute as ALL } from ${JSON.stringify(route)};`,
    );
    application = await createTestApplication(
      { env: defineEnv({}) },
      {
        projectRoot: root,
        services: async () => ({
          context: {},
          close: async () => {
            throw cleanup;
          },
        }),
      },
    );
    const closing = application.close();
    await expect(closing).rejects.toBeInstanceOf(AggregateError);
    await expect(closing).rejects.toMatchObject({ errors: [cleanup] });
    expect(application.close()).toBe(closing);
  } finally {
    try {
      await application?.close().catch((failure) => {
        if (
          !(failure instanceof AggregateError) ||
          failure.errors.length !== 1 ||
          failure.errors[0] !== cleanup
        )
          throw failure;
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
