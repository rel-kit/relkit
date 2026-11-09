// Portability fixture: the same call inside a Bun adapter is allowed.
import { Database } from "bun:sqlite";

export const server = Bun.serve({ port: 0, fetch: () => new Response("ok") });
export const database = new Database(":memory:");
