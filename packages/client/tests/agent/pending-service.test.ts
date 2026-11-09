import { expect, it } from "vitest";
import { createPendingOperations } from "../../src/react/pending.service.js";
import { PendingCapacityError } from "../../src/react/pending-errors.js";

/** Session storage stand-in that records every persisted value. */
class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  /** @returns The number of stored entries. */
  get length(): number {
    return this.values.size;
  }
  /** @returns Nothing, after removing every entry. */
  clear(): void {
    this.values.clear();
  }
  /** @param key - Entry key. @returns The stored value or null. */
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  /** @param index - Entry position. @returns The key at that position or null. */
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  /** @param key - Entry key. @returns Nothing, after removing it. */
  removeItem(key: string): void {
    this.values.delete(key);
  }
  /** @param key - Entry key. @param value - Serialized value. @returns Nothing. */
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

it("simultaneous hashes cannot exceed capacity or persist transmitted inputs", async () => {
  const storage = new MemoryStorage();
  const service = createPendingOperations({ memory: new Map(), storage: () => storage });
  const results = await Promise.allSettled(
    Array.from({ length: 101 }, (_, index) =>
      service.remember(
        "capacity",
        "job-trigger",
        "job",
        { private: index },
        {},
        { operationId: `intent-${index}`, retainRequest: true },
      ),
    ),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(100);
  const failure = results.find((result) => result.status === "rejected");
  expect(failure?.status === "rejected" && failure.reason).toBeInstanceOf(PendingCapacityError);
  const entries = service.list("capacity");
  expect(entries).toHaveLength(100);
  expect(JSON.stringify(entries)).not.toContain("private");
  expect(storage.values.size).toBe(100);
  expect(JSON.stringify([...storage.values.values()])).not.toContain("private");
  const entry = entries[0]!;
  expect(service.request("capacity", entry.operationId)).toMatchObject({
    private: expect.any(Number),
  });
  await expect(
    service.remember("capacity", "job-trigger", "job", {}, {}, { operationId: "intent-102" }),
  ).rejects.toBeInstanceOf(PendingCapacityError);
});

it("recovers persisted metadata in a new service while requests stay memory-only", async () => {
  const storage = new MemoryStorage();
  const first = createPendingOperations({ memory: new Map(), storage: () => storage });
  const metadata = await first.remember(
    "restore",
    "job-trigger",
    "job",
    { secret: 1 },
    {},
    { operationId: "restored", retainRequest: true },
  );
  storage.setItem("relkit.pending.restore.malformed", "{not json");
  storage.setItem("relkit.pending.restore.invalid", JSON.stringify({ kind: "job-trigger" }));
  const second = createPendingOperations({ memory: new Map(), storage: () => storage });
  expect(second.list("restore")).toEqual([metadata]);
  expect(second.request("restore", "restored")).toBeUndefined();
  expect(await second.matches("restore", "restored", { secret: 1 })).toBe(true);
  second.forget("restore", "restored");
  expect(storage.getItem("relkit.pending.restore.restored")).toBeNull();
  second.clear("restore");
  expect(storage.length).toBe(0);
  expect(first.request("restore", "restored")).toEqual({ secret: 1 });
});
