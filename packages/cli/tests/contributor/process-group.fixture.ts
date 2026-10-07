import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.on("SIGTERM", () => {});

if (process.argv[2] !== "descendant") {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "descendant"], {
    stdio: "ignore",
  });
  writeFileSync("pids.json", JSON.stringify([process.pid, child.pid]));
}

setInterval(() => {}, 1_000);
