import { mkdir } from "node:fs/promises";

await mkdir(".zsys", { recursive: true });
const { initializeDatabase } = await import("./data/application.data-model.js");
initializeDatabase();
