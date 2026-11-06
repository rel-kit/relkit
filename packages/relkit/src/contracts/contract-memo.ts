/**
 * Remembers successful results of pure synchronous contract adapters. Path and identity
 * normalization are pure functions of their text inputs, and compilation calls them for the
 * same handful of files and IDs thousands of times per check (graph hashing alone normalizes
 * every source location); each call otherwise starts an observed Effect run. A remembered
 * result is returned without that run. Failures are never remembered, so a rejected input
 * goes through the observed operation and throws the same error every time.
 */

/** Entries kept per memo before it starts over; bounds memory in long-lived processes. */
const LIMIT = 50_000;

/** One memo of string results keyed by string inputs. */
export interface ContractMemo {
  /**
   * Returns the remembered result for a key, or computes and remembers it.
   * @param key - Complete text identity of the inputs.
   * @param compute - Observed computation; its errors propagate and are not remembered.
   * @returns The result for these inputs.
   */
  readonly get: (key: string, compute: () => string) => string;
}

/**
 * Creates an empty bounded memo.
 * @returns A memo whose entries are dropped together once it holds {@link LIMIT} of them.
 */
export function contractMemo(): ContractMemo {
  let entries = new Map<string, string>();
  return {
    get: (key, compute) => {
      const known = entries.get(key);
      if (known !== undefined) return known;
      const result = compute();
      if (entries.size >= LIMIT) entries = new Map();
      entries.set(key, result);
      return result;
    },
  };
}
