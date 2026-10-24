/**
 * Checks that generation endpoints initialize after core application readiness.
 * Real Hono routing verifies late registration occurs on a separate, unused app,
 * concurrent requests share one initializer, and failures preserve eager traffic.
 */
import { expect, test } from "vitest";
import { createPreparedApp } from "../src/prepared-app.js";
import { preparedOptions } from "./prepared-fixture.js";

test("serves eager routes before rich endpoints and initializes once before dispatch", async () => {
  let initialized = 0;
  const prepared = await createPreparedApp(preparedOptions(), async (app) => {
    initialized += 1;
    app.get("/_relkit/v1/runtime/test-query", (context) => context.text("inspector complete"));
  });
  try {
    const eager = await prepared.fetch(new Request("http://localhost/hello"));
    expect(eager.status).toBe(200);
    await eager.text();
    expect(initialized).toBe(0);
    const responses = await Promise.all(
      [0, 1].map(() =>
        prepared.fetch(new Request("http://localhost/_relkit/v1/runtime/test-query")),
      ),
    );
    expect(await Promise.all(responses.map((response) => response.text()))).toEqual([
      "inspector complete",
      "inspector complete",
    ]);
    expect(initialized).toBe(1);
  } finally {
    await prepared.close();
  }
});

test("retains eager traffic and caches one rich-endpoint initialization failure", async () => {
  let initialized = 0;
  const failure = new Error("deliberately delayed support failed");
  const prepared = await createPreparedApp(preparedOptions(), async () => {
    initialized += 1;
    throw failure;
  });
  try {
    for (let index = 0; index < 2; index += 1)
      await expect(
        prepared.fetch(new Request("http://localhost/_relkit/v1/runtime/test-query")),
      ).rejects.toMatchObject({ cause: failure });
    const response = await prepared.fetch(new Request("http://localhost/hello"));
    expect(response.status).toBe(200);
    await response.text();
    expect(initialized).toBe(1);
  } finally {
    await prepared.close();
  }
});

test("generation_close_joins_legacy_endpoint_disposal", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let disposed = false;
  const application = await createPreparedApp(preparedOptions(), async (app) => {
    app.get("/_relkit/v1/runtime/test", (context) => context.text("ready"));
    return async () => {
      entered.resolve();
      await release.promise;
      disposed = true;
    };
  });
  await application.fetch(new Request("http://localhost/_relkit/v1/runtime/test"));
  const closing = application.close();
  await entered.promise;
  expect(disposed).toBe(false);
  release.resolve();
  await closing;
  expect(disposed).toBe(true);
});

test("generation_close_preserves_disposal_failure", async () => {
  const application = await createPreparedApp(preparedOptions(), async (app) => {
    app.get("/_relkit/v1/runtime/test", (context) => context.text("ready"));
    return async () => {
      throw new Error("native endpoint disposal failed");
    };
  });
  await application.fetch(new Request("http://localhost/_relkit/v1/runtime/test"));
  await expect(application.close()).rejects.toMatchObject({
    operation: "prepared.endpoints.dispose",
  });
});
