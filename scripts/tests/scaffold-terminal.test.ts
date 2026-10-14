/** Exercises real terminal prompting and interruption so scope closure proves native child termination rather than only finalizer registration. */
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Fiber } from "effect";
import { scaffoldTerminal } from "../scaffold-terminal-owner.js";
import { scaffoldNative } from "../scaffold-native.js";

test("native terminal sends the expected input and returns complete child display", async () => {
  const result = await Effect.runPromise(
    scaffoldTerminal({
      command: [
        "-e",
        'console.log("Enter answer");const reader=Bun.stdin.stream().getReader();const result=await reader.read();console.log(new TextDecoder().decode(result.value).trim());reader.releaseLock();',
      ],
      cwd: process.cwd(),
      answers: [["Enter answer", "accepted\r"]],
      env: {},
    }),
  );
  expect(result.code).toBe(0);
  expect(result.output).toContain("accepted");
});

test("interruption joins the detached native child before terminal and fixture release", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* Effect.acquireRelease(
          scaffoldNative("terminal.test.root", () =>
            mkdtemp(join(tmpdir(), "relkit-terminal-owner-")),
          ),
          (root) =>
            scaffoldNative("terminal.test.release", () =>
              rm(root, { recursive: true, force: true }),
            ).pipe(Effect.orDie),
        );
        const source =
          'import {writeFileSync} from "node:fs";writeFileSync("pid",String(process.pid));process.on("SIGTERM",()=>{writeFileSync("released","yes");process.exit(0)});setInterval(()=>{},1000);';
        const fiber = yield* scaffoldTerminal({
          command: ["-e", source],
          cwd: root,
          answers: [],
          env: {},
        }).pipe(Effect.forkScoped);
        for (let attempt = 0; !existsSync(join(root, "pid")) && attempt < 200; attempt++)
          yield* Effect.sleep("10 millis");
        expect(existsSync(join(root, "pid"))).toBe(true);
        const pid = Number(
          yield* scaffoldNative("terminal.test.pid", () => readFile(join(root, "pid"), "utf8")),
        );
        yield* Fiber.interrupt(fiber);
        expect(
          yield* scaffoldNative("terminal.test.closed", () =>
            readFile(join(root, "released"), "utf8"),
          ),
        ).toBe("yes");
        expect(() => process.kill(pid, 0)).toThrow();
      }),
    ),
  );
});
