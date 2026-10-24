/**
 * Describes byte observations at the scoped packed-fixture registry boundary.
 * Compressed archive identity is separate from installed physical instances and
 * from repeated network transfers during cold and warm attempts.
 */

/** One measured compressed archive served to a package manager. */
export interface ConsumerArchive {
  readonly name: string;
  readonly version: string;
  readonly bytes: number;
}

/** Borrowed registry handle, valid only inside the collector's owning Scope. */
export interface ConsumerRegistry {
  readonly url: string;
  readonly archives: ReadonlyMap<string, ConsumerArchive>;
  readonly transferredBytes: () => number;
}
