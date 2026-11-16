/** The type of an option that an authoring API does not have, so that the type error on the
 * option names it: `Type 'number' is not assignable to type 'UnknownOption<"timeout">'`.
 * @example const extra: UnknownOption<"timeout"> = { option: "timeout" };
 */
export interface UnknownOption<Name extends string> {
  readonly option: Name;
}

/** The type of an option that was removed, so that the type error on it names what to use.
 * @example const old: RemovedOption<"publishes", "dependencies.events"> = { option: "publishes", use: "dependencies.events" };
 */
export interface RemovedOption<Name extends string, Replacement extends string> {
  readonly option: Name;
  readonly use: Replacement;
}

/**
 * Gives every key of an options object that is not an option the type {@link UnknownOption}, or
 * {@link RemovedOption} when `Removed` names its replacement. An API whose options object is
 * itself a type parameter adds this to its parameter type, because such an object is not checked
 * for extra keys.
 * @example type Extra = RejectUnknownOptions<{ id: string; timeout: number }, "id">;
 */
export type RejectUnknownOptions<
  Options,
  Known extends PropertyKey,
  Removed extends Readonly<Record<string, string>> = {},
> = {
  readonly [Key in Exclude<keyof Options, Known>]?: Key extends keyof Removed
    ? RemovedOption<Key & string, Removed[Key]>
    : UnknownOption<Key & string>;
};
