/** Portable dependency and patch metadata generated from the root catalog. */
export type BuildCatalog = {
  dependencies: Record<string, string>;
  effectVersion: string;
  patches: Record<string, { version: string; key: string; asset: string; hash: string }>;
};
