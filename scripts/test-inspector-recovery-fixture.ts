/** Creates the small authored project used by ordinary and prepared recovery checks. */
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { recoveryDependencies } from "./test-inspector-recovery-dependencies";

export async function recoveryFixture(
  root: string,
  repository: string,
  backendPort: number,
  inspectorPort: number,
): Promise<void> {
  await cp(join(repository, "tests/compiler/fixtures/valid-minimal"), root, { recursive: true });
  await recoveryDependencies(root, repository);
  await cp(
    join(repository, "templates/default/v1/minimal/tsconfig.json"),
    join(root, "tsconfig.json"),
  );
  for (const [file, entrypoint] of [
    ["src/hello/service.ts", "services"],
    ["src/routes/hello/[name]/route.ts", "routes"],
  ] as const) {
    const path = join(root, file);
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace('"@relkit/app"', `"@relkit/app/${entrypoint}"`),
    );
  }
  const cli = join(repository, "packages/cli/src/bin.ts");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "reload-recovery-fixture",
      type: "module",
      scripts: {
        dev: `bun ${cli} dev --port ${backendPort} --inspector-port ${inspectorPort} --local off --no-color --verbose`,
      },
    }),
  );
  await writeFile(
    join(root, "relkit.config.ts"),
    `import { defineApp, defineEnv, env } from "@relkit/app/config";
export default defineApp({id:"reload-recovery",env:defineEnv({DAYS:env.number().default(7)})});`,
  );
  await writeFile(
    join(root, "src/hello/functions/hello.function.ts"),
    `import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
export default defineFunction({id:"hello.say-hello",input:z.object({name:z.string()}),output:z.object({message:z.string()}),handler:async (_input,context)=>({message:typeof context.env.DAYS+":"+context.env.DAYS})});`,
  );
  await writeFile(join(root, ".env"), "DAYS=7\n");
}

/** Delays the real Next child so the cold-start policy is exercised even on a fast machine. */
export async function recoveryInspector(root: string, source: string): Promise<string> {
  const directory = join(root, "inspector-launch");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ scripts: { dev: "bun launch.mjs" } }),
  );
  await writeFile(
    join(directory, "launch.mjs"),
    `
let child;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (child) { child.kill("SIGTERM"); await child.exited; }
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
await Bun.sleep(6000);
child = Bun.spawn([process.execPath, "run", "dev"], { cwd: ${JSON.stringify(source)}, env: process.env, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
process.exit(await child.exited);
`,
  );
  return directory;
}
