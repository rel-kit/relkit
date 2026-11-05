/**
 * Packages a release marks deprecated on npm right after it publishes them, with the message
 * the package manager shows on install. The final `@relkit/app` re-exports `relkit`, so a 0.8
 * project keeps building, and its message points to `relkit` and the migration guide. The
 * publish script runs `npm deprecate` for each one in the batch; the beta rehearsal serves the
 * same `deprecated` field from its local registry.
 */

/** Deprecation message per package name. */
export const releaseDeprecations: Readonly<Record<string, string>> = {
  "@relkit/app":
    "RelKit is now the relkit package. Install relkit and run relkit migrate: https://relkit.dev/guides/migrate/relkit-0-9",
};

/**
 * Lists the `npm deprecate` invocations for one published batch.
 * @param packages - Published names and versions.
 * @returns One argument list per deprecated package in the batch.
 */
export function deprecationCommands(
  packages: readonly { readonly name: string; readonly version: string }[],
): string[][] {
  return packages.flatMap(({ name, version }) => {
    const message = releaseDeprecations[name];
    return message === undefined ? [] : [["deprecate", `${name}@${version}`, message]];
  });
}
