/** Resolved descriptor IDs by source binding, which the generated registries key their entries by. */

/**
 * Keys a descriptor by its source module and export name.
 * @param module - Authored source module.
 * @param exportName - Export binding.
 * @returns The lookup key used by `identities`.
 */
export function identityKey(module: string, exportName: string): string {
  return `${module}\0${exportName}`;
}

/**
 * Maps each normalized descriptor's source binding to its resolved ID, for `identities`.
 * @param descriptors - Descriptors after normalization resolved their IDs.
 * @returns Resolved IDs keyed by `<module>\0<export name>`.
 */
export function resolvedIdentities(
  descriptors: readonly {
    readonly id: string;
    readonly exportName: string;
    readonly reference?: { readonly module: string };
  }[],
): ReadonlyMap<string, string> {
  return new Map(
    descriptors.flatMap((descriptor) =>
      descriptor.reference === undefined
        ? []
        : [
            [
              identityKey(descriptor.reference.module, descriptor.exportName),
              descriptor.id,
            ] as const,
          ],
    ),
  );
}
