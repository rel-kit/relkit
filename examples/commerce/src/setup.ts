import { mkdir } from "node:fs/promises";

await mkdir(".relkit", { recursive: true });
