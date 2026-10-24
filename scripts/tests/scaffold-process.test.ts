/** Exercises native child-group exit/output ownership and preserves failed drain evidence through scoped release. */
import { expect, test } from "bun:test";
import { Effect, Exit, References } from "effect";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { scaffoldChild, ScaffoldProcess, scaffoldProcessLayer } from "../scaffold-process.js";

test("runs the selected browser executable without routing its arguments through Bun", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-browser-command-"));
  const session = basename(root);
  try {
    const executable = join(root, "agent-browser");
    await writeFile(
      executable,
      '#!/usr/bin/env node\nconsole.log(process.argv.slice(2).join(" "));\n',
    );
    await chmod(executable, 0o755);
    const output = await Effect.runPromise(
      ScaffoldProcess.use((commands) =>
        commands.run({
          executable: "agent-browser",
          cwd: root,
          args: ["--session", session, "close"],
          env: { PATH: `${root}:${process.env.PATH ?? ""}` },
        }),
      ).pipe(Effect.provide(scaffoldProcessLayer)),
    );
    expect(output.trim()).toBe(`--session ${session} close`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  "forces a TERM-resistant producer to exit as soon as its bounded drain fails",
  () =>
    Effect.runPromise(
      Effect.gen(function* () {
        let terminated = false;
        let forcedByWatchdog = false;
        const exit = yield* Effect.exit(
          Effect.scoped(
            Effect.gen(function* () {
              const owner = yield* scaffoldChild({
                cwd: process.cwd(),
                executable: "node",
                args: [
                  "-e",
                  'process.on("SIGTERM",()=>{});process.stdout.write("x".repeat(5000000));setInterval(()=>{},100)',
                ],
              });
              const deadline = setTimeout(() => {
                forcedByWatchdog = true;
                owner.process.kill("SIGKILL");
              }, 4000);
              try {
                const [nativeExit, stdout] = yield* Effect.promise(() => owner.settled);
                clearTimeout(deadline);
                expect(nativeExit.status).toBe("fulfilled");
                expect(stdout.status).toBe("rejected");
                if (stdout.status === "rejected")
                  expect(String(stdout.reason)).toContain("exceeded its bound");
                terminated = owner.process.signalCode === "SIGKILL";
              } finally {
                clearTimeout(deadline);
              }
            }),
          ),
        );
        expect(terminated).toBe(true);
        expect(forcedByWatchdog).toBe(false);
        expect(Exit.isFailure(exit)).toBe(true);
      }).pipe(Effect.provideService(References.MinimumLogLevel, "None")),
    ),
  10000,
);

test("joins a failed bounded output drain and terminates its native producer", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      let pid = 0;
      const exit = yield* Effect.exit(
        Effect.scoped(
          Effect.gen(function* () {
            const owner = yield* scaffoldChild({
              cwd: process.cwd(),
              args: ["-e", 'process.stdout.write("x".repeat(5000000));setInterval(()=>{},100)'],
            });
            pid = owner.process.pid;
            yield* Effect.promise(() => owner.settled);
          }),
        ).pipe(Effect.timeout("5 seconds")),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(pid).toBeGreaterThan(0);
      expect(() => process.kill(-pid, 0)).toThrow();
      if (Exit.isFailure(exit))
        expect(exit.cause.reasons.some((reason) => reason._tag === "Die")).toBe(true);
    }),
  ));

test("returns complete stdout only after successful native exit and both drains", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const processService = yield* ScaffoldProcess;
      const output = yield* processService.run({
        cwd: process.cwd(),
        args: [
          "-e",
          'process.stdout.write("native complete");process.stderr.write("native diagnostics")',
        ],
      });
      expect(output).toBe("native complete");
    }).pipe(
      Effect.provide(scaffoldProcessLayer),
      Effect.provideService(References.MinimumLogLevel, "None"),
    ),
  ));
