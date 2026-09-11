import { expect, test } from "bun:test";
import { clearPendingOperations, pendingOperations, rememberPending } from "./src/react/pending.ts";

test("persists only the caller-supplied agent thread identity", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const storage = memoryStorage();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
  try {
    await rememberPending(
      "scope",
      "agent-run",
      "orders.support",
      { orderId: "one" },
      {
        threadId: "order:one",
      },
    );

    expect(pendingOperations("scope")).toMatchObject([{ threadId: "order:one" }]);
    expect(Object.keys(storage).some((key) => key.startsWith("relkit.agent-thread."))).toBe(false);
    clearPendingOperations("scope");
    expect(pendingOperations("scope")).toEqual([]);
  } finally {
    if (previous === undefined) delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    else Object.defineProperty(globalThis, "sessionStorage", previous);
  }
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  const storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
      delete (storage as unknown as Record<string, unknown>)[key];
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
      (storage as unknown as Record<string, unknown>)[key] = value;
    },
  } satisfies Storage;
  return storage;
}
