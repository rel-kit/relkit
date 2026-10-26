/**
 * Retries recoverable npm provenance failures before its registry upload. This stays
 * dependency-free for the cold Node publication job and never retries other errors.
 */

/**
 * Repeats only identity lookup failure or an already accepted transparency entry.
 * @param publish - Synchronous command using the same validated archive on every attempt.
 * @param pause - Bounded delay adapter, replaced by deterministic tests.
 * @returns Completion after success; the final or non-retryable failure propagates unchanged.
 */
export async function publishWithProvenanceRetry(
  publish: () => void,
  pause: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      publish();
      return;
    } catch (cause) {
      if (!(cause instanceof Error) || attempt === 3) throw cause;
      const identity = /^npm error code IDENTITY_TOKEN_READ_ERROR\r?$/m.test(cause.message);
      const duplicateEntry =
        /^npm error code TLOG_CREATE_ENTRY_ERROR\r?$/m.test(cause.message) &&
        /\(409\) an equivalent entry already exists in the transparency log/.test(cause.message);
      // npm 11.19.0 creates provenance before PUT; retry signs the same validated bytes.
      if (!identity && !duplicateEntry) throw cause;
      console.warn(`Provenance creation failed; retrying original archive (${attempt}/2)`);
      await pause(attempt * 10_000);
    }
  }
}
