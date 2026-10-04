const closedIterators = new WeakSet<object>();

/**
 * Bounds a native iterator's return without changing an existing public failure.
 * @param iterator - Owned native iterator.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export async function closeIterator(iterator: AsyncIterator<unknown>): Promise<void> {
  if (typeof iterator.return !== "function") return;
  if (typeof iterator === "object" && iterator !== null) {
    if (closedIterators.has(iterator)) return;
    closedIterators.add(iterator);
  }
  const closing = Promise.resolve(iterator.return()).then(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      closing,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 5_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Creates the existing local epoch used for synthesized authoritative snapshots.
 * @returns A fresh local authoritative-snapshot epoch.
 */
export function newEpoch(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
