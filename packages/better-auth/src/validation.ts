export function validateBasePath(value: string): void {
  if (!value.startsWith("/") || value.endsWith("/") || value.includes("*") || value.includes("[")) {
    throw new TypeError(`Invalid Better Auth base path "${value}"`);
  }
}
