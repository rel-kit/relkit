import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const child = Bun.spawn(
  [process.execPath, "x", "tsc", "-p", "tests/types/tsconfig.json", "--pretty", "false"],
  { cwd: root, stdout: "inherit", stderr: "inherit" },
);

const exitCode = await child.exited;
if (exitCode !== 0) {
  throw new Error(`Type fixtures failed with exit code ${exitCode}`);
}

console.log("Type fixtures passed (public descriptor inference and boundary rejection).");
