import { Database } from "bun:sqlite";

// Existing singleton storage boundary; the caller owns its lifecycle.
export function openDatabase(filename: string) {
  return new Database(filename, { create: true });
}
