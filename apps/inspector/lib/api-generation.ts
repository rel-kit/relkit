/** Browser controls use the generation the user observed; explicit action identities win. */
export function observedGeneration<Value>(value: Value): string | undefined {
  return value !== null &&
    typeof value === "object" &&
    "generationId" in value &&
    typeof value.generationId === "string"
    ? value.generationId
    : undefined;
}

/** Parses only native JSON action bodies; malformed input remains the server's validation error. */
export function mutationGeneration(
  body: BodyInit | null | undefined,
  fallback: string | undefined,
) {
  if (typeof body !== "string") return fallback;
  try {
    return observedGeneration(JSON.parse(body)) ?? fallback;
  } catch {
    return fallback;
  }
}
