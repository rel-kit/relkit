/**
 * Joins native feed completion within the public teardown deadline.
 * @param interrupted - Scoped worker interruption, already initiated by its owner.
 * @param running - The same worker's native completion Promise.
 * @returns Completion after cleanup or the existing five-second deadline.
 * @remarks The owner aborts the request before calling this browser timer boundary.
 * Registry disposal subsequently joins the service scope itself.
 */
export async function joinFeedTeardown(
  interrupted: Promise<void>,
  running: Promise<void>,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([interrupted, running]).then(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 5_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
