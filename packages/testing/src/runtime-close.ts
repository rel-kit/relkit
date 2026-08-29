export async function closeRuntime(
  pending: Set<Promise<unknown>>,
  timeoutMs: number,
  cleanup: (failed: boolean) => void,
  failed: () => boolean,
): Promise<void> {
  const completed = await waitForPending(pending, timeoutMs);
  cleanup(failed() || !completed);
}

async function waitForPending(pending: Set<Promise<unknown>>, timeoutMs: number): Promise<boolean> {
  const all = Promise.allSettled([...pending]).then(() => undefined);
  if (pending.size === 0) {
    await all;
    return true;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const completed = await Promise.race([all.then(() => true), timeout]);
  if (timer !== undefined) clearTimeout(timer);
  return completed;
}
