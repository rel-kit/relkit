import { expect, test } from "bun:test";
import { is, StringChunk, type SQL } from "drizzle-orm";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { activateDrizzleService } from "../src/activation.js";
import { defineDrizzleService } from "../src/service.js";

const records = sqliteTable("records", { id: integer().primaryKey() });

test("declarations stay lazy and shared activation retains the first environment after close", async () => {
  const environments: Readonly<Record<string, unknown>>[] = [];
  let releases = 0;
  const service = defineDrizzleService({
    schema: { records },
    client: ({ env }) => {
      environments.push(env);
      return {};
    },
    dispose: () => {
      releases++;
    },
  });
  expect(environments).toEqual([]);
  const firstEnvironment = { DATABASE_PATH: "first" };
  const first = activateDrizzleService(service, firstEnvironment);
  const second = activateDrizzleService(service, { DATABASE_PATH: "second" });
  expect(second).toBe(first);
  const active = await first;
  expect(environments).toEqual([firstEnvironment]);
  await Promise.all([active.close(), active.close()]);
  expect(await activateDrizzleService(service, {})).toBe(active);
  expect(environments).toHaveLength(1);
  expect(releases).toBe(1);
});

test("a shared rejected acquisition preserves its error and permits a fresh attempt", async () => {
  const failure = new TypeError("client acquisition failed");
  let attempts = 0;
  const service = defineDrizzleService({
    schema: { records },
    client: () => {
      attempts++;
      if (attempts === 1) throw failure;
      return {};
    },
  });
  const first = activateDrizzleService(service, {});
  const second = activateDrizzleService(service, {});
  expect(second).toBe(first);
  await expect(first).rejects.toBe(failure);
  await expect(second).rejects.toBe(failure);
  const active = await activateDrizzleService(service, {});
  expect(attempts).toBe(2);
  await active.close();
});

test("shared descriptors returning one SQLite client serialize callbacks and reject nesting", async () => {
  const statements: string[] = [];
  let transactionActive = false;
  const client = {
    run: (query: SQL) => {
      const statement = query.queryChunks
        .flatMap((chunk) => (is(chunk, StringChunk) ? [chunk.value] : []))
        .join("");
      if (statement === "begin") {
        if (transactionActive) throw new Error("overlapping shared-client BEGIN");
        transactionActive = true;
      } else {
        transactionActive = false;
      }
    },
  };
  const firstDeclaration = defineDrizzleService({ schema: { records }, client: () => client });
  const secondDeclaration = defineDrizzleService({ schema: { records }, client: () => client });
  const first = await activateDrizzleService(firstDeclaration, {});
  const second = await activateDrizzleService(secondDeclaration, {});
  let entered: () => void = () => undefined;
  let release: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const finish = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const running = first.context.transaction(async (context) => {
      statements.push("first");
      entered();
      // Bun's pending .rejects matcher pumps unrelated Promise continuations in
      // the current AsyncLocalStorage context. Capture first, then assert without
      // changing the native nested-transaction rejection being characterized.
      const nested = await context.transaction(() => undefined).catch((error: unknown) => error);
      expect(nested).toBeInstanceOf(TypeError);
      expect((nested as TypeError).message).toBe("Nested portable transactions are not supported");
      await finish;
      statements.push("first complete");
    });
    await ready;
    const waiting = second.context.transaction(() => {
      statements.push("second");
    });
    release();
    await Promise.all([running, waiting]);
    expect(statements).toEqual(["first", "first complete", "second"]);
  } finally {
    release();
    await Promise.all([first.close(), second.close()]);
  }
});
