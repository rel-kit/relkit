/** Synchronous parser type retained for public field compatibility.
 * @example const parse: Parse<number> = Number;
 */
export type Parse<T> = (value: string) => Exclude<T, undefined>;

/** Lazy default factory type invoked only when source input is absent.
 * @example const fallback: DefaultFactory<string> = () => "test";
 */
export type DefaultFactory<T> = () => Exclude<T, undefined>;
