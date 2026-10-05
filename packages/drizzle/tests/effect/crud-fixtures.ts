/** Deterministic native builders preserving state-dependent query evaluation. */
export function memoryClient(returning: boolean): MemoryClient {
  let stored: Record<string, unknown> | undefined;
  let transactions = 0;
  let writes = 0;
  const makeQuery = (execute: () => unknown): MemoryQuery => {
    const query: MemoryQuery = {
      from: () => query,
      where: () => query,
      limit: () => query,
      offset: () => query,
      orderBy: () => query,
      then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
        Promise.resolve().then(execute).then(resolve, reject),
      ...(returning ? { returning: () => query } : {}),
    };
    return query;
  };
  const client: MemoryClient = {
    select: () => makeQuery(() => (stored === undefined ? [] : [{ ...stored }])),
    insert: () => ({
      values: (value: Record<string, unknown>) =>
        makeQuery(() => {
          writes++;
          stored = { ...value };
          return returning ? [{ ...stored }] : {};
        }),
    }),
    update: () => ({
      set: (value: Record<string, unknown>) =>
        makeQuery(() => {
          writes++;
          stored = { ...stored, ...value };
          return returning ? [{ ...stored }] : {};
        }),
    }),
    delete: () =>
      makeQuery(() => {
        writes++;
        const before = stored;
        stored = undefined;
        return returning ? [before] : {};
      }),
    transaction: async <A>(run: (database: MemoryClient) => Promise<A>) => {
      transactions++;
      return run(client);
    },
    state: () => ({ stored, transactions, writes }),
  };
  return client;
}
import type { MemoryClient, MemoryQuery } from "./crud-fixtures.types.js";
