/** Minimal native query contract for deterministic dialect tests. */
export interface MemoryQuery {
  from(): MemoryQuery;
  where(): MemoryQuery;
  limit(): MemoryQuery;
  offset(): MemoryQuery;
  orderBy(): MemoryQuery;
  then(
    resolve: (value: unknown) => unknown,
    reject?: (error: unknown) => unknown,
  ): Promise<unknown>;
  returning?: () => MemoryQuery;
}

/** Shared fake native database contract across returning/non-returning dialects. */
export interface MemoryClient {
  select(): MemoryQuery;
  insert(): { values(value: Record<string, unknown>): MemoryQuery };
  update(): { set(value: Record<string, unknown>): MemoryQuery };
  delete(): MemoryQuery;
  transaction<A>(run: (database: MemoryClient) => Promise<A>): Promise<A>;
  state(): { stored: Record<string, unknown> | undefined; transactions: number; writes: number };
}
