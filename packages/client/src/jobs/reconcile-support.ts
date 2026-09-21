const closedIterators = new WeakSet<object>();

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

export function newEpoch(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
