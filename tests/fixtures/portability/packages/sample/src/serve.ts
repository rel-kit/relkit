// Portability fixture: a Bun call outside a runtime adapter.
import { readFile } from "node:fs/promises";

export const server = Bun.serve({ port: 0, fetch: () => new Response("ok") });
export const text = () => readFile("x", "utf8");
