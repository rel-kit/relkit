/** `createRelkit(config)`: a runtime handle for scripts, seeders and other frameworks. It runs the
 * built application's activation with no HTTP listener, event consumers or job workers.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { RelkitHandle } from "./runtime-handle.types.js";

/** Options for {@link createRelkit}. */
export interface CreateRelkitOptions {
  /** Project root that holds `.relkit/build`; defaults to the current directory. */
  readonly root?: string;
}

/** A runtime handle that owns its providers until `close()` releases them.
 * @example const relkit = await createRelkit(config); await relkit.close();
 */
export type StandaloneRelkitHandle = RelkitHandle & {
  /** Releases the providers the handle started; calling it again does nothing.
   * @returns Completion after every provider is released.
   * @example await relkit.close();
   */
  readonly close: () => Promise<void>;
};

/** Raised when `createRelkit` finds no usable build of the application. */
export class ApplicationBuildUnavailableError extends Error {
  readonly code = "RELKIT_APPLICATION_BUILD_UNAVAILABLE" as const;

  constructor(entry: string, reason: string) {
    super(`createRelkit needs a current build at ${entry} (${reason}); run \`relkit build\` first.`);
    this.name = "ApplicationBuildUnavailableError";
  }
}

const BUILD_ENTRY = ".relkit/build/server/index.js";

/** Starts a runtime handle for code that runs outside the application, such as a seed script.
 * Only the providers the application's graph needs are activated; nothing listens for requests.
 * @param config - The application's `relkit.config.ts` default export.
 * @param options - Project root holding the build.
 * @returns The handle; call `close()` when done.
 * @throws ApplicationBuildUnavailableError when the build is missing or predates `createRelkit`.
 * @example
 * const relkit = await createRelkit(config);
 * await relkit.database.orders.insert({ data: { id: "o1", totalCents: 100 } });
 * await relkit.close();
 */
export async function createRelkit(
  config: { readonly ref: { readonly kind: "app" } },
  options: CreateRelkitOptions = {},
): Promise<StandaloneRelkitHandle> {
  if (config?.ref?.kind !== "app")
    throw new TypeError("createRelkit expects the application's defineApp(...) configuration");
  const entry = join(resolve(options.root ?? process.cwd()), BUILD_ENTRY);
  if (!existsSync(entry)) throw new ApplicationBuildUnavailableError(entry, "no build found");
  const module = (await import(pathToFileURL(entry).href)) as {
    readonly activateRelkitApplication?: (mode: { readonly embedded: true }) => Promise<{
      readonly handle: RelkitHandle;
      readonly close: () => Promise<void>;
    }>;
  };
  if (typeof module.activateRelkitApplication !== "function")
    throw new ApplicationBuildUnavailableError(entry, "the build predates createRelkit");
  const { handle, close } = await module.activateRelkitApplication({ embedded: true });
  return Object.freeze({ ...handle, close });
}
