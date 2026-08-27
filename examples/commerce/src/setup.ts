import { mkdir } from "node:fs/promises";

await mkdir(".relkit", { recursive: true });
const { initializeDatabase } = await import("@app/data/application.data-model.js");
initializeDatabase();
