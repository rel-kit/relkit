/** Proves a real child finishes its final Next-style writes before original
 * header/config bytes are restored, including the failed-scenario cleanup path.
 */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit } from "effect";
import { playwrightSuite } from "../playwright-suite.js";
import { scaffoldChild } from "../scaffold-process.js";

for (const failed of [false, true])
  test(`restores browser source after joined child exit (failed=${failed})`, async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-browser-source-"));
    const application = join(root, "apps/inspector");
    let artifacts = "";
    let pid = 0;
    const failure = new Error("original scenario failure");
    try {
      await mkdir(application, { recursive: true });
      for (const name of ["next-env.d.ts", "tsconfig.json"])
        await writeFile(join(application, name), `original ${name}\n`);
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const selected = yield* playwrightSuite(root, "inspector");
            artifacts = selected.artifacts;
            const cache = join(application, selected.dist);
            yield* Effect.promise(() => mkdir(cache, { recursive: true }));
            const child = yield* scaffoldChild({
              executable: "node",
              cwd: root,
              args: ["-e", writer, application, artifacts],
            });
            pid = child.process.pid;
            yield* Effect.promise(() => ready(join(artifacts, "ready")));
            const header = yield* Effect.promise(() =>
              readFile(join(application, "next-env.d.ts"), "utf8"),
            );
            const config = yield* Effect.promise(() =>
              readFile(join(application, "tsconfig.json"), "utf8"),
            );
            expect(header).toBe("child active");
            expect(config).toBe("child active");
            if (failed) return yield* Effect.fail(failure);
          }),
        ),
      );
      expect(Exit.isFailure(exit)).toBe(failed);
      if (Exit.isFailure(exit))
        expect(
          exit.cause.reasons.some((reason) => reason._tag === "Fail" && reason.error === failure),
        ).toBe(true);
      expect(() => process.kill(pid, 0)).toThrow();
      for (const name of ["next-env.d.ts", "tsconfig.json"]) {
        expect(await readFile(join(application, name), "utf8")).toBe(`original ${name}\n`);
        expect(await readFile(join(artifacts, `${name}.after`), "utf8")).toBe("child joined");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

const writer = `const fs=require('node:fs'),path=require('node:path');
const [application,artifacts]=process.argv.slice(1);
process.on('SIGTERM',()=>{for(const name of ['next-env.d.ts','tsconfig.json'])fs.writeFileSync(path.join(application,name),'child joined');process.exit(0);});
for(const name of ['next-env.d.ts','tsconfig.json'])fs.writeFileSync(path.join(application,name),'child active');
fs.writeFileSync(path.join(artifacts,'ready'),'ready');setInterval(()=>{},100);`;

/** Bounds fixture acquisition while all real child cleanup remains scope-owned. */
async function ready(path: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (await Bun.file(path).exists()) return;
    await Bun.sleep(10);
  }
  throw new Error("Owned browser source writer did not start");
}
