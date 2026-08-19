export function resolveBackendUrl(baseUrl: string, path: string): string {
  return baseUrl === "" ? path : new URL(path.replace(/^\//, ""), `${baseUrl}/`).toString();
}
