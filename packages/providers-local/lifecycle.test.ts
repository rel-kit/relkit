import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localProviders } from "@zsys/app";
import { bindLocalProviderFactory } from "./src/index.ts";

const roots: string[] = [];

describe("local provider generation lifecycle", () => {
  test("owns bucket/cache state and recovers it after shutdown", async () => {
    const stateRoot = await makeStateRoot();
    const providerSet = localProviders({ stateDirectory: stateRoot });
    const factory = bindLocalProviderFactory(providerSet)!;
    const first = await factory.create({
      generationId: "generation-one",
      environment: "development",
      providerSet,
    });

    expect(first.stateRoot).toBe(stateRoot);
    expect(await readdir(join(stateRoot, "buckets"))).toContain("default");
    expect(await readdir(join(stateRoot, "cache"))).toContain("default");
    await first.providers.buckets.put("assets/item", new Uint8Array([1, 2]));
    await first.providers.cache.set("sku", { price: 25 });
    await first.dispose();
    await expect(first.providers.buckets.get("assets/item")).rejects.toThrow("closed");

    const second = await factory.create({
      generationId: "generation-two",
      environment: "development",
      providerSet,
    });
    expect(await second.providers.buckets.get("assets/item")).toEqual(new Uint8Array([1, 2]));
    expect(await second.providers.cache.get("sku")).toEqual({ price: 25 });
    expect(second.providers.cache.capabilities.persistence).toBe("restart-recovery");
    await second.release();
    await second.release();
  });

  test("quarantines malformed bucket records and cache snapshots", async () => {
    const stateRoot = await makeStateRoot();
    const providerSet = localProviders({ stateDirectory: stateRoot });
    const factory = bindLocalProviderFactory(providerSet)!;
    const generation = await factory.create({
      generationId: "generation-corrupt",
      environment: "development",
      providerSet,
    });
    await generation.providers.buckets.put("broken", new Uint8Array([9]));
    await generation.providers.cache.set("broken", "value");
    await generation.dispose();

    const objectFile = (await readdir(join(stateRoot, "buckets", "default", "objects")))[0]!;
    await writeFile(join(stateRoot, "buckets", "default", "objects", objectFile), "not-json");
    await writeFile(join(stateRoot, "cache", "default", "snapshot.json"), "not-json");

    const recovered = await factory.create({
      generationId: "generation-recovered",
      environment: "development",
      providerSet,
    });
    expect(await recovered.providers.buckets.get("broken")).toBeUndefined();
    expect(await recovered.providers.cache.get("broken")).toBeUndefined();
    expect(await readdir(join(stateRoot, "buckets", "default", ".zsys-quarantine"))).toHaveLength(
      1,
    );
    expect(await readdir(join(stateRoot, "cache", "default", ".zsys-quarantine"))).toHaveLength(1);
    await recovered.dispose();
  });

  test("does not expose raw state reads through provider objects", async () => {
    const stateRoot = await makeStateRoot();
    const providerSet = localProviders({ stateDirectory: stateRoot });
    const factory = bindLocalProviderFactory(providerSet)!;
    const generation = await factory.create({
      generationId: "generation-opaque",
      environment: "development",
      providerSet,
    });

    await generation.providers.cache.set("opaque", true);
    expect("readFile" in generation.providers.buckets).toBe(false);
    expect("readFile" in generation.providers.cache).toBe(false);
    expect(await readFile(join(stateRoot, "cache", "default", "snapshot.json"), "utf8")).toContain(
      '"version":1',
    );
    await generation.dispose();
  });
});

async function makeStateRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zsys-provider-"));
  roots.push(root);
  return join(root, ".zsys", "state");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
