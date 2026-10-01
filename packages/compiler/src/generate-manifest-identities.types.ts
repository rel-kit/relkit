/** Executable source property path requiring a stable identity rebinding. */
export interface IdentityBinding {
  readonly module: string;
  readonly exportName: string;
  readonly path: readonly (string | number)[];
  readonly id: string;
}
