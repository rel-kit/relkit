/** Reads parameter names from the established filesystem route convention. */
export function routePathParameters(file: string): readonly string[] {
  return file
    .replaceAll("\\", "/")
    .split("/")
    .flatMap((segment) => {
      const match = /^\[(?:\[)?(?:\.\.\.)?([A-Za-z_][A-Za-z0-9_]*)\](?:\])?$/.exec(segment);
      return match?.[1] ? [match[1]] : [];
    });
}
