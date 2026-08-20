export function resolveBackendUrl(baseUrl: string, path: string): string {
  if (baseUrl === "") return path;
  const normalizedPath = path.replace(/^\//, "");
  if (baseUrl.startsWith("/")) return `${baseUrl.replace(/\/$/, "")}/${normalizedPath}`;
  return new URL(normalizedPath, `${baseUrl}/`).toString();
}
