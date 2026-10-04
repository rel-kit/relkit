import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { activateDrizzleService } from "../src/activation.js";
import { defineDrizzleService, drizzleRuntimeOf } from "../src/service.js";

const records = sqliteTable("records", { id: integer().primaryKey() });

test("isolated owners have fresh clients and closing one preserves another", async () => {
  let acquired = 0;
  let closed = 0;
  const service = defineDrizzleService({
    schema: { records },
    client: () => {
      acquired++;
      const sqlite = new Database(":memory:");
      sqlite.run("create table records (id integer primary key)");
      return drizzle({ client: sqlite });
    },
    dispose: (client) => {
      closed++;
      client.$client.close();
    },
  });
  const first = await activateDrizzleService(service, {}, { isolated: true });
  try {
    const second = await activateDrizzleService(service, {}, { isolated: true });
    try {
      expect(first.client).not.toBe(second.client);
      await first.close();
      await second.context.records.insert({ data: { id: 2 } });
      expect(await second.context.records.findMany()).toEqual([{ id: 2 }]);
      const third = await activateDrizzleService(service, {}, { isolated: true });
      try {
        expect(await third.context.records.findMany()).toEqual([]);
      } finally {
        await third.close();
      }
      expect(acquired).toBe(3);
    } finally {
      await second.close();
    }
  } finally {
    await first.close();
  }
  expect(closed).toBe(3);
});

test("concurrent close shares completion and context failure releases the acquired prefix", async () => {
  let releases = 0;
  let finish: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const service = defineDrizzleService({
    schema: { records },
    client: () => ({}),
    dispose: async () => {
      releases++;
      await pending;
    },
  });
  const active = await activateDrizzleService(service, {}, { isolated: true });
  try {
    const first = active.close();
    expect(active.close()).toBe(first);
    finish();
    await first;
  } finally {
    finish();
    await active.close();
  }
  expect(releases).toBe(1);

  const defect = new Error("context construction defect");
  Object.defineProperty(drizzleRuntimeOf(service), "tables", {
    get: () => {
      throw defect;
    },
  });
  await expect(activateDrizzleService(service, {}, { isolated: true })).rejects.toBe(defect);
  expect(releases).toBe(2);
});
