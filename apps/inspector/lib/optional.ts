/**
 * `{ [key]: value }` when the value is present, otherwise `{}`: spread it to set an optional
 * property under `exactOptionalPropertyTypes` without computing the value twice.
 */
export function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });
}
