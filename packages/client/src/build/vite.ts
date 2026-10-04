import type { RelkitVitePlugin } from "./vite.types.js";
import { readPublicFingerprint } from "./manifest.js";
export type { RelkitVitePlugin } from "./vite.types.js";

/**
 * Creates the Vite adapter that defines the generated client fingerprint.
 * @param options - Existing public configuration and authority.
 * @returns The Vite plugin defining the public fingerprint.
 */
export function relkit(options: { readonly root?: string } = {}): RelkitVitePlugin {
  return {
    name: "relkit",
    config: () => ({
      define: {
        "globalThis.__RELKIT_PUBLIC_FINGERPRINT__": JSON.stringify(
          readPublicFingerprint(options.root),
        ),
      },
    }),
  };
}
