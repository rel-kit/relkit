/** Creates the small authored project used by ordinary and prepared recovery checks. */
import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { recoveryDependencies } from "./test-inspector-recovery-dependencies";

export async function recoveryFixture(
  root: string,
  repository: string,
  backendPort: number,
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
  const route = join(root, "src/routes/hello/[name]/route.ts");
  await writeFile(
    route,
    (await readFile(route, "utf8")) +
      '\nexport const POST = defineRoute({ id: "hello.write", target: hello.sayHello });\n',
  );
  const cli = join(repository, "packages/cli/src/bin.ts");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "reload-recovery-fixture",
      type: "module",
      scripts: {
        dev: `bun ${cli} dev --port ${backendPort} --local off --no-color --verbose`,
      },
    }),
  );
  await writeFile(
    join(root, "relkit.config.ts"),
    `import { defineApp, defineEnv, env } from "@relkit/app/config";
export default defineApp({id:"reload-recovery",inspector:{enabled:true},env:defineEnv({DAYS:env.number().default(7)})});`,
  );
  await writeFile(
    join(root, "src/hello/functions/hello.function.ts"),
    `import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
export default defineFunction({id:"hello.say-hello",input:z.object({name:z.string()}),output:z.object({message:z.string()}),handler:async (_input,context)=>({message:typeof context.env.DAYS+":"+context.env.DAYS})});`,
  );
  await writeFile(join(root, ".env"), "DAYS=7\n");
}
