/** Metadata and syntax facts consumed by native workspace boundary discovery. */
export type DependencyMap = Record<string, string>;

export type PackageManifest = {
  name?: string;
  workspaces?: string[];
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
  optionalDependencies?: DependencyMap;
  peerDependencies?: DependencyMap;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

export type Scope = {
  root: string;
  path: string;
  manifest?: PackageManifest;
  declaredDependencies: Set<string>;
};

export type ImportReference = {
  specifier: string;
  position: number;
};
