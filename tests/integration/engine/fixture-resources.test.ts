import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import app from "../../../apps/fixture-commerce/src/app.ts";
import createOrder from "../../../apps/fixture-commerce/src/functions/create-order.function.ts";
import sendReceipt from "../../../apps/fixture-commerce/src/functions/send-receipt.function.ts";
import {
  bindLocalProviderFactory,
  type LocalProviderGeneration,
} from "../../../packages/providers-local/src/index.ts";
import { invokeFunction } from "../../../packages/testing/src/index.ts";
import type { DependencyClientSources } from "../../../packages/engine/src/index.ts";

const roots: string[] = [];

describe("fixture-commerce managed resources", () => {
  test("uses declared typed clients and recovers bucket/cache state after restart", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "zsys-commerce-"));
    const stateRoot = join(workspace, ".zsys", "state");
    roots.push(workspace);
    const providerSet = app.providers.development;
    const factory = bindLocalProviderFactory(providerSet);
    if (factory === undefined) throw new Error("Fixture development provider is not local");

    let first: LocalProviderGeneration | undefined;
    let second: LocalProviderGeneration | undefined;
    try {
      first = await factory.create({
        generationId: "commerce-generation-one",
        environment: "development",
        providerSet,
        stateRoot,
      });
      expect(Object.keys(createOrder.dependencies ?? {}).sort()).toEqual([
        "cache",
        "events",
        "jobs",
      ]);
      expect(Object.keys(sendReceipt.dependencies ?? {})).toEqual(["buckets"]);

      await expect(
        invokeFunction(
          createOrder,
          {
            orderId: "order-1",
            sku: "sku-1",
            quantity: 2,
            customerEmail: "buyer@example.com",
          },
          { clients: clientsFor(first) },
        ),
      ).resolves.toEqual({ orderId: "order-1", receiptKey: "order-1.json", totalCents: 2_000 });
      await expect(
        invokeFunction(
          sendReceipt,
          { orderId: "order-1", receiptKey: "order-1.json" },
          { clients: clientsFor(first) },
        ),
      ).resolves.toEqual({ receiptId: "order-1:order-1.json" });
      expect(first.providers.cache.snapshot()).toMatchObject({ entries: 1, misses: 1 });
      expect(new TextDecoder().decode(await first.providers.buckets.get("order-1.json"))).toBe(
        JSON.stringify({ orderId: "order-1" }),
      );

      await first.release();
      second = await factory.create({
        generationId: "commerce-generation-two",
        environment: "development",
        providerSet,
        stateRoot,
      });
      await expect(
        invokeFunction(
          createOrder,
          {
            orderId: "order-1",
            sku: "sku-1",
            quantity: 2,
            customerEmail: "buyer@example.com",
          },
          { clients: clientsFor(second) },
        ),
      ).resolves.toEqual({ orderId: "order-1", receiptKey: "order-1.json", totalCents: 2_000 });
      expect(second.providers.cache.snapshot()).toMatchObject({ entries: 1, hits: 1 });
      expect(new TextDecoder().decode(await second.providers.buckets.get("order-1.json"))).toBe(
        JSON.stringify({ orderId: "order-1" }),
      );
    } finally {
      await second?.release();
      await first?.release();
    }
  });
});

function clientsFor(generation: LocalProviderGeneration): DependencyClientSources {
  return {
    buckets: { assets: generation.providers.buckets },
    cache: { prices: generation.providers.cache },
    events: {
      orderCreated: {
        publish: async () => ({ instanceId: "event-1", accepted: true }),
      },
    },
    jobs: {
      sendReceiptJob: {
        enqueue: async () => ({ instanceId: "job-1", accepted: true }),
      },
    },
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
