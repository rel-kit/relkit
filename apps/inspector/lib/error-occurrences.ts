const CONCURRENCY = 4;

/**
 * Counts, for each declared error, the retained requests that ended with it. Each count scans the
 * history, so a few run at a time, and a count that cannot be read is left without a number
 * instead of failing the page.
 * @param ids - Declared error identifiers.
 * @param count - Reads the number of retained requests that ended with one error.
 * @returns One entry per id, in the order given.
 */
export async function errorOccurrences(
  ids: readonly string[],
  count: (id: string) => Promise<number | undefined>,
): Promise<ReadonlyMap<string, number | undefined>> {
  const results = new Map<string, number | undefined>(ids.map((id) => [id, undefined]));
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < ids.length) {
      const id = ids[next++]!;
      try {
        results.set(id, await count(id));
      } catch {
        results.set(id, undefined);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return results;
}

/** The requests page filtered to one declared error, or to the requests that failed unexpectedly. */
export function requestsHref(
  filter: { readonly errorId: string } | { readonly outcome: "defect" },
): string {
  const params = new URLSearchParams();
  if ("errorId" in filter) params.set("errorId", filter.errorId);
  else params.set("outcome", filter.outcome);
  return `/requests?${params.toString().replace(/\+/g, "%20")}`;
}
