export interface AwsCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

export function text(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (value instanceof URL) return value.toString();
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is invalid`);
  return value.trim();
}
