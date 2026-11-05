/**
 * Shared pieces of the newcomer walkthroughs: a stopwatch that records named steps, the packed
 * candidate the walkthroughs create projects from, and the `relkit.walkthrough-result` file the
 * metrics report reads.
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { Effect } from "effect";
import { packBaselineArtifacts } from "../dev-readiness/packed-artifacts.js";
import { readManifests } from "../pack-and-smoke-create-relkit-pack.js";
import type { WalkthroughResult } from "../metrics/types.js";

/** Records the seconds elapsed at the end of each named step. */
export class Stopwatch {
  readonly steps: { name: string; seconds: number }[] = [];
  private readonly started = Date.now();

  /**
   * Ends a step.
   * @param name - Step name.
   * @returns Whole seconds since the stopwatch started.
   */
  lap(name: string): number {
    const seconds = Math.round((Date.now() - this.started) / 1000);
    this.steps.push({ name, seconds });
    console.log(`${name} after ${seconds} s`);
    return seconds;
  }
}

/**
 * Reads one `--name value` option.
 * @param name - Option name without dashes.
 * @returns The value, or undefined when absent.
 */
export function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
  return value;
}

/** A packed release directory and how long packing took. */
export interface PackedCandidate {
  readonly directory: string;
  /** Seconds spent packing; zero when the directory was given. */
  readonly packSeconds: number;
}

/**
 * Packs this checkout once so the walkthrough times creation from tarballs, the way a newcomer
 * receives packages from npm, and not the build of the framework itself.
 * @param repository - Framework checkout.
 * @param given - A release directory made earlier, which is reused untouched.
 * @returns A directory holding the tarballs and a `manifest.json` of them.
 */
export async function packedCandidate(
  repository: string,
  given: string | undefined,
): Promise<PackedCandidate> {
  if (given !== undefined) return { directory: resolve(given), packSeconds: 0 };
  const started = Date.now();
  const temporary = await mkdtemp(join(tmpdir(), "relkit-walkthrough-pack-"));
  const manifests = await readManifests(repository);
  const tarballs = await Effect.runPromise(
    Effect.scoped(packBaselineArtifacts(temporary, manifests)),
  );
  const directory = join(temporary, "release-artifacts");
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify({
      packages: [...tarballs].map(([name, path]) => ({ name, file: relative(directory, path) })),
    }),
  );
  return { directory, packSeconds: Math.round((Date.now() - started) / 1000) };
}

/**
 * Writes a walkthrough result.
 * @param path - Output file; nothing is written when undefined.
 * @param result - Result without protocol and time.
 * @returns The complete record.
 */
export async function writeWalkthroughResult(
  path: string | undefined,
  result: Omit<WalkthroughResult, "protocol" | "createdAt">,
): Promise<WalkthroughResult> {
  const record: WalkthroughResult = {
    protocol: "relkit.walkthrough-result",
    createdAt: new Date().toISOString(),
    ...result,
  };
  if (path !== undefined) {
    await mkdir(dirname(resolve(path)), { recursive: true });
    await writeFile(resolve(path), `${JSON.stringify(record, undefined, 2)}\n`);
  }
  return record;
}
