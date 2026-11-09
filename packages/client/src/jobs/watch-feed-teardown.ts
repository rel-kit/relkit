/**
 * Joins native feed completion within the public teardown deadline.
 * @param running - The aborted worker's completion Promise.
 * @returns Completion after cleanup or the existing five-second deadline.
 * @remarks The owner aborts the worker before calling this browser timer boundary.
 * Registry disposal subsequently joins the feed itself.
 */
export async function joinFeedTeardown(running: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      running,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 5_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
