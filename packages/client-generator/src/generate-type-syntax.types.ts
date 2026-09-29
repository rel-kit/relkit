/** Modifiers for a rendered TypeScript object property.
 * @remarks Properties are readonly unless `readonly` is explicitly false.
 * @example const options: TypePropertyOptions = { optional: true };
 */
export interface TypePropertyOptions {
  readonly optional?: boolean;
  readonly readonly?: boolean;
}
