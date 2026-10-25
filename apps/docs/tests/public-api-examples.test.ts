/** Exercises the published public-API examples with isolated state and no external services. */
import { expect, test } from "bun:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { cacheAdapter } from "../examples/public-api/provider.js";
import { contextResolver } from "../examples/public-api/context.js";
import { readLocalObject } from "../examples/public-api/local.js";
import { checkHelp, previewOrders } from "../examples/public-api/tooling.js";

test("the provider example declares a sensitive connection and immutable capability metadata", () => {
  expect(cacheAdapter.capability.id).toBe("cache");
  expect(cacheAdapter.connectionContract.fields.url).toMatchObject({
    required: true,
    sensitive: true,
  });
  expect(cacheAdapter.behavior.value).toEqual({ keyPrefix: "products" });
  expect(Object.isFrozen(cacheAdapter)).toBe(true);
});

test("the shared context example resolves environment references and preserves prompt ordering", async () => {
  const noop = (): void => undefined;
  const log = { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
  const result = await contextResolver.resolve({ signal: new AbortController().signal, log });
  expect(result.constants).toEqual({ maxItems: 20, region: "eu-west-1" });
  expect(result.prompts.support).toEqual([
    "Answer using the order details.",
    "Do not invent delivery dates.",
  ]);
});

test("the local provider example stores exact bytes and leaves its caller-owned directory intact", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "relkit-docs-local-"));
  try {
    expect(new TextDecoder().decode(await readLocalObject(root))).toBe("Hello, RELKIT!");
    await access(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tooling previews include starter files and do not create the destination", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "relkit-docs-preview-"));
  try {
    const plan = await previewOrders(root);
    expect(plan.files).toContain("relkit.config.ts");
    expect(plan.destination).toBe(resolve(root, "relkit-orders"));
    expect(await Bun.file(resolve(plan.destination, "package.json")).exists()).toBe(false);
    expect(checkHelp?.name).toBe("check");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
