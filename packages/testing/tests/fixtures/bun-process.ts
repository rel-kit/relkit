import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Effect } from "effect";

const execute = promisify(execFile);

/**
 * Runs a real Bun fixture under a deadline and the calling fiber's cancellation.
 * @param path Absolute path to a fixture requiring native Bun behavior.
 * @returns Captured output after successful child exit; failures keep native stderr.
 * @example yield* runBunFixture(new URL("./native.ts", import.meta.url).pathname);
 */
export const runBunFixture = Effect.fn("Testing.fixture.bun")((path: string) =>
  Effect.tryPromise({
    try: (signal) => execute("bun", ["run", path], { signal, timeout: 15_000, maxBuffer: 131_072 }),
    catch: (cause) => cause,
  }),
);
