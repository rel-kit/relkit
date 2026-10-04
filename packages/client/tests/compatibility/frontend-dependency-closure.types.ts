/** Authored manifest fields used to verify the browser workspace dependency closure. */
export interface PackageManifest {
  readonly name: string;
  readonly dependencies?: Readonly<Record<string, string>>;
}
