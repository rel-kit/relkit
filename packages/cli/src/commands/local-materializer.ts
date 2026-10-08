/**
 * Requires the existing status/stop cohort to have exactly one materializer.
 * @param values - Selected binding materializers.
 * @returns The unique materializer; an empty or mixed cohort retains the existing failure.
 */
export function requireLocalMaterializer(values: readonly string[]): string {
  const materializer = values[0];
  if (materializer === undefined || values.some((value) => value !== materializer))
    throw new Error("Local service bindings must use one materializer");
  return materializer;
}
