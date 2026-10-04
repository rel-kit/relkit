/** The minimal Vite plugin contract defining the generated client fingerprint. */
export interface RelkitVitePlugin {
  readonly name: "relkit";
  config(): {
    readonly define: Readonly<Record<string, string>>;
  };
}
