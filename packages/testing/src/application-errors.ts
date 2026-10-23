/** Normalizes foreign acquisition rejections without replacing native Error identity. */
export function nativeServiceError<Failure>(cause: Failure): Error {
  return cause instanceof Error ? cause : new Error("Native service activation failed", { cause });
}
