/** Runs a seed script against the built fixture through `createRelkit` and checks it exits on its own. */
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** Seed script that writes through the database, calls a function and closes the handle. */
const seedSource = `import { createRelkit } from "relkit";
import config from "./relkit.config.ts";

const relkit = await createRelkit(config);
await relkit.database.records.insert({ data: { id: 7, value: "seeded" } });
const { count } = await relkit.functions.records.probe({ mode: "read" });
await relkit.close();
console.log(JSON.stringify({ count }));
`;

/**
 * Writes and runs the seed script; a listener or worker left running would keep it from exiting.
 * @param root - Built fixture root.
 * @param environment - The fixture's environment without a port.
 * @returns The script's exit code and standard output.
 */
export async function runSeedScript(
  root: string,
  environment: Readonly<Record<string, string>>,
): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  await writeFile(join(root, "seed.ts"), seedSource);
  try {
    const { stdout } = await execute("bun", ["run", "--no-env-file", "seed.ts"], {
      cwd: root,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...environment },
      timeout: 30_000,
    });
    return { exitCode: 0, stdout };
  } catch (error) {
    const failure = error as {
      readonly code?: number;
      readonly stdout?: string;
      readonly stderr?: string;
    };
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}
