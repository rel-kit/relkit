export const POSTGRES_IMAGE =
  "postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685";
export const BUN_IMAGE =
  "oven/bun:1.3.10@sha256:b86c67b531d87b4db11470d9b2bd0c519b1976eee6fcd71634e73abfa6230d2e";

export function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(name + " is invalid");
  return value;
}

export function number(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 65_535)
    throw new TypeError(name + " is invalid");
  return value as number;
}
