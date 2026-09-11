import { readPublicFingerprint } from "./manifest.js";

export interface RelkitVitePlugin {
  readonly name: "relkit";
  config(): {
    readonly define: Readonly<Record<string, string>>;
  };
}

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
