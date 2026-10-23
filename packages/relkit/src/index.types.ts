/** Describes the local package fields the lightweight wrapper inspects to select an explicitly installed compatible CLI; no project code is evaluated. */

/** Installed package metadata checked before the wrapper launches its native executable. */
export interface CliManifest {
  readonly name?: string;
  readonly version?: string;
  readonly bin?: { readonly relkit?: string };
}
